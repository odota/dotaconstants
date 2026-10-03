import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  describeGameSource,
  fetchAndParse,
  gameSourceUrl,
  loadHeroes,
  readGameFile,
  resolveGameSourceRef,
} from "../tasks/source.ts";

const ref = "cf0d37a32c8df338a7832fd32a282747969e9a5f";

const setEnv = (t: TestContext, key: string, value: string | undefined) => {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
};

test("local provenance records actual paths and treats the SHA as an unverified declaration", (t) => {
  const directory = path.join(os.tmpdir(), "unverified-game-data");
  setEnv(t, "DOTA_SOURCE_DIR", directory);
  const file = "scripts/npc/npc_abilities.txt";
  const source = describeGameSource(ref, [file]);
  assert.equal(source.mode, "local");
  assert.equal(source.declaredRef, ref);
  assert.equal(source.verifiedRef, null);
  assert.equal(source.verification, "unverified-local");
  assert.deepEqual(source.files, [
    {
      path: path.resolve(directory, file),
      comparisonUrl: gameSourceUrl(ref, file),
    },
  ]);
  assert.equal("url" in source.files[0], false);
});

test("remote provenance records a pinned URL without claiming independent content authentication", (t) => {
  setEnv(t, "DOTA_SOURCE_DIR", undefined);
  const file = "steam.inf";
  const source = describeGameSource(ref, [file]);
  assert.equal(source.mode, "remote");
  assert.equal(source.declaredRef, ref);
  assert.equal(source.verifiedRef, null);
  assert.equal(source.verification, "pinned-remote-url");
  assert.deepEqual(source.files, [{ url: gameSourceUrl(ref, file) }]);
});

test("identical local and remote bytes produce identical text and fingerprints with or without a BOM", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "dotaconstants-bom-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  setEnv(t, "DOTA_SOURCE_DIR", undefined);
  const file = "abilities_english.txt";
  const contents = '"lang"\r\n{ "value" "中文\uFEFF text" }\r\n';
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  for (const prefix of ["", "\uFEFF"]) {
    const bytes = Buffer.from(prefix + contents, "utf8");
    fs.writeFileSync(path.join(directory, file), bytes);
    t.mock.method(globalThis, "fetch", async () => new Response(bytes));
    process.env.DOTA_SOURCE_DIR = directory;
    const local = await readGameFile(ref, file);
    delete process.env.DOTA_SOURCE_DIR;
    const remote = await readGameFile(ref, file);
    assert.equal(local, contents);
    assert.equal(remote, contents);
    assert.equal(hash(local), hash(remote));
    assert.equal(hash(local), hash(contents));
    process.env.DOTA_SOURCE_DIR = directory;
    const localParsed = await fetchAndParse(ref, gameSourceUrl(ref, file));
    delete process.env.DOTA_SOURCE_DIR;
    assert.deepEqual(
      await fetchAndParse(ref, gameSourceUrl(ref, file)),
      localParsed,
    );
  }
});

test("local game sources work without network for heroes, localization and shared scripts", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "dotaconstants-source-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  setEnv(t, "DOTA_SOURCE_DIR", directory);
  setEnv(t, "DOTA_SOURCE_REF", ref);
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Network disabled");
  });
  const write = (file: string, contents: string) => {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  write(
    "scripts/npc/npc_heroes.txt",
    '#base "heroes/npc_dota_hero_test.txt"\n"DOTAHeroes" { "Version" "1" }',
  );
  write(
    "scripts/npc/heroes/npc_dota_hero_test.txt",
    '"DOTAHeroes" { "npc_dota_hero_test" { "HeroID" "1" } }',
  );
  assert.equal(await resolveGameSourceRef(), ref);
  assert.equal(
    (await loadHeroes(ref)).DOTAHeroes.npc_dota_hero_test.HeroID,
    "1",
  );

  for (const file of [
    "resource/localization/abilities_english.txt",
    "resource/localization/dota_english.txt",
    "resource/localization/hero_lore_english.txt",
    "resource/localization/hero_chat_wheel_english.txt",
    "resource/localization/patchnotes/patchnotes_english.txt",
    "scripts/npc/npc_abilities.txt",
    "scripts/npc/npc_ability_ids.txt",
    "scripts/npc/npc_units.txt",
    "scripts/npc/items.txt",
    "scripts/npc/neutral_items.txt",
    "scripts/chat_wheel.txt",
  ]) {
    write(file, '"local" { "value" "local-only content" }');
    assert.deepEqual(await fetchAndParse(ref, gameSourceUrl(ref, file)), {
      local: { value: "local-only content" },
    });
  }
  await assert.rejects(fetchAndParse(ref, gameSourceUrl(ref, "missing.txt")), {
    code: "ENOENT",
  });
  assert.equal(fetch.mock.callCount(), 0);
});

test("without a local directory game resources use the pinned URL and reject HTTP errors", async (t) => {
  setEnv(t, "DOTA_SOURCE_DIR", undefined);
  const url = gameSourceUrl(ref, "scripts/npc/npc_abilities.txt");
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response('{"source":"remote"}'),
  );
  assert.deepEqual(await fetchAndParse(ref, url), { source: "remote" });
  assert.equal(fetch.mock.calls[0].arguments[0], url);
  fetch.mock.mockImplementation(
    async () => new Response("Not Found", { status: 404 }),
  );
  await assert.rejects(fetchAndParse(ref, url), /HTTP 404/);
});

test("non-game feeds keep their remote path even with a local game directory", async (t) => {
  setEnv(t, "DOTA_SOURCE_DIR", "unused-local-game-directory");
  const url =
    "https://www.dota2.com/datafeed/herodata?language=english&hero_id=1";
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response('{"result":{"data":{"heroes":[]}}}'),
  );
  assert.deepEqual(await fetchAndParse(ref, url), {
    result: { data: { heroes: [] } },
  });
  assert.equal(fetch.mock.calls[0].arguments[0], url);
});
