import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { loadHeroes, parseJsonOrVdf, readGameFile } from "./source.ts";
import { analyzeSpecialBonusValues } from "./util.ts";

// Integration evidence: real pinned game files, explicitly stubbed unrelated feeds.
// All builds run in fresh temporary directories; the checkout is never built over.
const ref = process.env.DOTA_SOURCE_REF;
const source = process.env.DOTA_SOURCE_DIR;
assert.ok(
  ref && /^[a-f0-9]{40}$/.test(ref) && source,
  "Set DOTA_SOURCE_REF to a full SHA and DOTA_SOURCE_DIR to its dota directory",
);
const root = process.cwd();
const output = process.argv.indexOf("--output");
const directory =
  output >= 0
    ? path.resolve(process.argv[output + 1])
    : fs.mkdtempSync(path.join(os.tmpdir(), "dotaconstants-generation-"));
fs.mkdirSync(directory, { recursive: true });
const base = "b4b5a8299de5f3e0704e62fdd04a6a54c4d4548e";
const start = "fc5d817b6d619747afaaa931c627f793f44c8ebf";
const git = (args: string[]) =>
  execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const countries = JSON.parse(
  git(["show", `${base}:build/countries.json`]).toString(),
);
const hash = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const treeIndex = process.argv.indexOf("--source-tree");
const verifiedFiles: { file: string; gitBlob: string; sha256: string }[] = [];
if (treeIndex >= 0) {
  const tree = JSON.parse(fs.readFileSync(process.argv[treeIndex + 1], "utf8"));
  assert.equal(tree.sha, ref);
  assert.equal(tree.truncated, false);
  for (const file of fs.readdirSync(source, { recursive: true }).map(String)) {
    const local = path.join(source, file);
    if (!fs.statSync(local).isFile()) continue;
    const entry = tree.tree.find(
      (entry: any) => entry.path === `dota/${file.replaceAll("\\", "/")}`,
    );
    assert.ok(entry && entry.type === "blob", file);
    const bytes = fs.readFileSync(local);
    const gitBlob = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    assert.equal(gitBlob, entry.sha, file);
    verifiedFiles.push({
      file: file.replaceAll("\\", "/"),
      gitBlob,
      sha256: hash(bytes),
    });
  }
}
const stub = path.join(directory, "transport.mjs");
fs.writeFileSync(
  stub,
  `
import fs from 'node:fs';
import path from 'node:path';
const source = ${JSON.stringify(path.resolve(source))};
const countries = ${JSON.stringify(Object.values(countries))};
globalThis.fetch = async input => {
  const url = String(input);
  const game = new RegExp('^https://raw[.]githubusercontent[.]com/dotabuff/d2vpkr/([^/]+)/dota/(.+)$').exec(url);
  if (game) {
    if (!['master', ${JSON.stringify(ref)}].includes(game[1])) throw Error('Wrong ref: ' + url);
    return new Response(fs.readFileSync(path.join(source, game[2])));
  }
  if (url === 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json')
    return new Response(JSON.stringify(countries));
  if (url.startsWith('http://www.dota2.com/datafeed/herodata?'))
    return new Response(JSON.stringify({result:{data:{heroes:[{id:Number(new URL(url).searchParams.get('hero_id')),name:'external-feed-test-stub',abilities:[]}]}}}));
  throw Error('Network disabled: ' + url);
};
`,
);

function prepare(name: string, revision?: string) {
  const target = path.join(directory, name);
  assert.ok(
    !fs.existsSync(target),
    `Output directory already contains ${name}`,
  );
  fs.mkdirSync(target);
  if (revision) {
    const archive = path.join(directory, `${name}.tar`);
    fs.writeFileSync(archive, git(["archive", "--format=tar", revision]));
    execFileSync("tar", ["-xf", archive, "-C", target]);
  } else {
    for (const file of ["tasks", "json", "package.json", "package-lock.json"])
      fs.cpSync(path.join(root, file), path.join(target, file), {
        recursive: true,
      });
    fs.mkdirSync(path.join(target, "build"));
  }
  for (const file of fs.readdirSync(path.join(target, "build")))
    fs.unlinkSync(path.join(target, "build", file));
  for (const file of ["cluster.json", "region.json"])
    fs.writeFileSync(
      path.join(target, "build", file),
      git(["show", `${start}:build/${file}`]),
    );
  fs.cpSync(
    path.join(root, "node_modules"),
    path.join(target, "node_modules"),
    { recursive: true },
  );
  return target;
}

function build(target: string, name: string, remote = false) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_OPTIONS: `--import=${pathToFileURL(stub).href}`,
  };
  if (remote) delete env.DOTA_SOURCE_DIR;
  // This is the repository's declared build script, through its package manager.
  const log = execFileSync("npm run build", {
    cwd: target,
    env,
    shell: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(directory, `${name}.log`), log);
  return Object.fromEntries(
    fs
      .readdirSync(path.join(target, "build"))
      .sort()
      .map((file) => [file, fs.readFileSync(path.join(target, "build", file))]),
  );
}

const baseFiles = build(prepare("base", base), "base");
const startFiles = build(prepare("start", start), "start");
const finalDirectory = prepare("final");
const finalFiles = build(finalDirectory, "final");
// Poison every regenerated file before rebuilding. Retained manual files are inputs.
for (const file of Object.keys(finalFiles).filter(
  (file) => !["cluster.json", "region.json"].includes(file),
))
  fs.writeFileSync(
    path.join(finalDirectory, "build", file),
    '{"poison":true}\n',
  );
assert.deepEqual(build(finalDirectory, "repeat"), finalFiles);
assert.deepEqual(build(prepare("remote"), "remote", true), finalFiles);

// Independent numeric oracle: read the raw definitions and template requirements
// directly, without using the generator's collector, resolver or expected lookup.
const all = (await loadHeroes(ref)).DOTAHeroes;
const heroes: any[] = Object.values(all).filter(
  (h: any) => h.HeroID && h.HeroID !== "0",
);
const scripts: Record<string, any> = Object.assign(
  {},
  parseJsonOrVdf(
    await readGameFile(ref, "scripts/npc/npc_abilities.txt"),
    "abilities",
  ).DOTAAbilities,
  ...heroes.map((h) => h.AbilityDefinitions ?? {}),
);
const tokens = parseJsonOrVdf(
  await readGameFile(ref, "resource/localization/abilities_english.txt"),
  "tokens",
).lang.Tokens;
const equipped = new Set(
  heroes.flatMap((h) =>
    Object.entries(h)
      .filter(([k]) => /^Ability\d+$/.test(k))
      .map(([, v]) => v),
  ),
);
const beforeCollection = JSON.stringify(scripts);
const collection = analyzeSpecialBonusValues(
  scripts,
  new Set([...equipped].map(String)),
);
let modifierEntries = 0;
for (const [ability, script] of Object.entries(scripts))
  for (const [attribute, value] of Object.entries(script.AbilityValues ?? {})) {
    if (!value || typeof value !== "object") continue;
    for (const [talent, raw] of Object.entries(value)) {
      if (
        !/^special_bonus_/.test(talent) ||
        /^special_bonus_(facet|scepter|shard)/.test(talent)
      )
        continue;
      modifierEntries++;
      assert.ok(
        collection.candidates.some(
          (candidate) =>
            candidate.ability === ability &&
            candidate.attribute === attribute &&
            candidate.talent === talent &&
            candidate.raw === raw,
        ),
        `${ability}/${attribute}/${talent}`,
      );
    }
  }
assert.equal(JSON.stringify(scripts), beforeCollection);
const reverse = (value: any): any =>
  !value || typeof value !== "object"
    ? value
    : Array.isArray(value)
      ? value.map(reverse)
      : Object.fromEntries(
          Object.entries(value)
            .toReversed()
            .map(([key, entry]) => [key, reverse(entry)]),
        );
assert.deepEqual(
  analyzeSpecialBonusValues(
    reverse(scripts),
    new Set([...equipped].map(String)),
  ).lookup,
  collection.lookup,
);
const current = new Set<string>(
  heroes.flatMap((h) =>
    Object.entries(h)
      .filter(
        ([k, v]) =>
          /^Ability\d+$/.test(k) &&
          Number(k.slice(7)) >= Number(h.AbilityTalentStart ?? 10) &&
          typeof v === "string" &&
          v.startsWith("special_bonus"),
      )
      .map(([, v]) => String(v)),
  ),
);
const abilities = JSON.parse(finalFiles["abilities.json"].toString());
let templated = 0;
let placeholders = 0;
const canonical = (s: string) =>
  s.replace(/-?(?:\d+(?:\.\d+)?|\.\d+)/g, (v) => String(Number(v)));
for (const name of current) {
  const template = Object.entries(tokens).find(
    ([key]) => key.toLowerCase() === `dota_tooltip_ability_${name}`,
  )?.[1];
  assert.equal(typeof template, "string", name);
  if (String(template).includes("{s:")) templated++;
  const expected = String(template).replace(
    /\{s:([^}]+)\}/gi,
    (_, key: string, offset: number) => {
      placeholders++;
      key = key.toLowerCase();
      const own: any = Object.entries(scripts[name]?.AbilityValues ?? {}).find(
        ([k]) => k.toLowerCase() === key,
      )?.[1];
      let value = typeof own === "object" ? own.value : own;
      if (value === undefined) {
        const options: { ability: string; value: string }[] = [];
        for (const [ability, script] of Object.entries(scripts))
          for (const [attribute, raw] of Object.entries(
            script.AbilityValues ?? {},
          ))
            if (
              raw &&
              typeof raw === "object" &&
              (key === "value" || `bonus_${attribute.toLowerCase()}` === key)
            ) {
              const modifier = (raw as any)[name];
              if (typeof modifier === "string")
                options.push({ ability, value: modifier });
            }
        const preferred = options.filter((entry) =>
          equipped.has(entry.ability),
        );
        const relevant = preferred.length ? preferred : options;
        const values = relevant.map((entry) =>
          entry.value
            .trim()
            .split(/\s+/)
            .map((v) => Number(v.replace(/^[+=x-]/, "").replace(/%$/, ""))),
        );
        assert.equal(
          new Set(values.map((v) => JSON.stringify(v))).size,
          1,
          `${name}/${key}`,
        );
        assert.ok(
          values.every((v) => v.every(Number.isFinite)),
          `${name}/${key}`,
        );
        value = values[0].join(" ");
      }
      const signed = /[+-]\s*$/.test(String(template).slice(0, offset));
      return String(value)
        .split(/\s+/)
        .map(Number)
        .map((v) => (signed ? Math.abs(v) : v))
        .join(" / ");
    },
  );
  assert.equal(canonical(abilities[name].dname), canonical(expected), name);
}

function differences(
  before: Record<string, Buffer>,
  after: Record<string, Buffer>,
) {
  return Object.keys(after).filter(
    (file) => !before[file]?.equals(after[file]),
  );
}
function namesDiff(before: Record<string, Buffer>) {
  const previous = JSON.parse(before["abilities.json"].toString());
  return Object.entries(abilities)
    .filter(
      ([name, data]: [string, any]) => previous[name]?.dname !== data.dname,
    )
    .map(([name, data]: [string, any]) => ({
      name,
      current: current.has(name),
      before: previous[name]?.dname ?? null,
      after: data.dname,
    }));
}
const report = {
  runtime: process.version,
  platform: process.platform,
  source: { ref, directory: path.resolve(source), mode: "local" },
  comparisons: {
    base,
    start,
    round: differences(startFiles, finalFiles),
    total: differences(baseFiles, finalFiles),
  },
  roundNames: namesDiff(startFiles),
  totalNames: namesDiff(baseFiles),
  independentCurrentCheck: {
    talents: current.size,
    templated,
    placeholders,
    errors: 0,
  },
  fullCollectionCheck: {
    modifierEntries,
    missingCandidates: 0,
    inputMutation: false,
    reversedTraversal: "Identical lookup",
  },
  repeatedGeneration: `All ${Object.keys(finalFiles).length} files byte-identical after poisoning ${Object.keys(finalFiles).filter((file) => !["cluster.json", "region.json"].includes(file)).length} regenerated files`,
  localRemoteParity: `All ${Object.keys(finalFiles).length} files byte-identical; remote transport returns the same local bytes (mock)`,
  externalFeeds:
    "Countries from base commit; hero feed stub. aghs_desc is not validated against a live feed",
  inputVerification: {
    method:
      treeIndex >= 0
        ? "Git blob hashes compared with supplied fixed-commit GitHub tree"
        : "Unverified local directory",
    files: verifiedFiles,
  },
  hashes: Object.fromEntries(
    Object.entries(finalFiles).map(([file, bytes]) => [file, hash(bytes)]),
  ),
};
fs.writeFileSync(
  path.join(directory, "verification.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
