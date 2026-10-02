import fs from "node:fs";
import path from "node:path";
import vdfparser from "vdf-parser";

export async function resolveGameSourceRef() {
  const requested = process.env.DOTA_SOURCE_REF ?? "master";
  if (/^[a-f0-9]{40}$/.test(requested)) return requested;
  if (process.env.DOTA_SOURCE_DIR)
    throw new Error(
      "DOTA_SOURCE_DIR requires an explicit commit SHA in DOTA_SOURCE_REF",
    );
  const response = await fetch(
    `https://api.github.com/repos/dotabuff/d2vpkr/commits/${encodeURIComponent(requested)}`,
  );
  if (!response.ok)
    throw new Error(
      `Cannot resolve game source revision: HTTP ${response.status}`,
    );
  const { sha } = await response.json();
  if (!/^[a-f0-9]{40}$/.test(sha))
    throw new Error("Invalid game source revision");
  return sha as string;
}

export const gameSourceUrl = (ref: string, file: string) =>
  `https://raw.githubusercontent.com/dotabuff/d2vpkr/${ref}/dota/${file}`;

export function describeGameSource(ref: string, files: string[]) {
  const directory = process.env.DOTA_SOURCE_DIR;
  return {
    mode: directory ? "local" : "remote",
    declaredRef: ref,
    // A declared SHA or pinned URL does not independently authenticate bytes.
    verifiedRef: null,
    verification: directory ? "unverified-local" : "pinned-remote-url",
    files: files.map((file) =>
      directory
        ? {
            path: path.resolve(directory, file),
            comparisonUrl: gameSourceUrl(ref, file),
          }
        : { url: gameSourceUrl(ref, file) },
    ),
  };
}

// Decode both paths identically: remove the initial UTF-8 BOM, preserving
// interior U+FEFF characters and line endings for parsing and fingerprints.
const decodeGameFile = (bytes: Uint8Array | ArrayBuffer) =>
  new TextDecoder("utf-8").decode(bytes);

export async function readGameFile(ref: string, file: string) {
  if (process.env.DOTA_SOURCE_DIR) {
    return decodeGameFile(
      fs.readFileSync(path.join(process.env.DOTA_SOURCE_DIR, file)),
    );
  }
  const url = gameSourceUrl(ref, file);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return decodeGameFile(await response.arrayBuffer());
}

export async function fetchAndParse(ref: string, url: string) {
  console.log(url);
  const gamePrefix = gameSourceUrl(ref, "");
  if (url.startsWith(gamePrefix)) {
    return parseJsonOrVdf(
      await readGameFile(ref, url.slice(gamePrefix.length)),
      url,
    );
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return parseJsonOrVdf(await response.text(), url);
}

export async function loadHeroes(ref: string) {
  const text = await readGameFile(ref, "scripts/npc/npc_heroes.txt");
  const baseRegex = /^#base\s+"heroes\/([^"]+)"/gm;
  const files = [...text.matchAll(baseRegex)].map((m) => m[1]);
  if (!files.length) throw new Error("No #base hero includes found");
  const result = parseJsonOrVdf(text.replace(baseRegex, ""), "npc_heroes.txt");
  result.DOTAHeroes ??= {};
  const heroes = await Promise.all(
    files.map(async (file) =>
      parseJsonOrVdf(
        await readGameFile(ref, `scripts/npc/heroes/${file}`),
        file,
      ),
    ),
  );
  for (const hero of heroes) Object.assign(result.DOTAHeroes, hero.DOTAHeroes);
  return result;
}

export function parseJsonOrVdf(text: string, url: string) {
  try {
    return JSON.parse(text);
  } catch (err) {
    try {
      let fixed = text;
      // Remove empty values that break parser
      fixed = fixed.replaceAll(
        `\t\t"ItemRequirements"\r\n\t\t""`,
        `\t\t"ItemRequirements"\t\t""`,
      );
      fixed = fixed.replaceAll(
        `\t\t\t"has_flying_movement"\t\r\n\t\t\t""`,
        `\t\t\t"has_flying_movement"\t\t""`,
      );
      fixed = fixed.replaceAll(
        `\t\t\t"damage_reduction"\t\r\n\t\t\t""`,
        `\t\t\t"damage_reduction"\t\t""`,
      );
      fixed = fixed.replaceAll(
        `\t"default_attack"\r\n\t""`,
        `\t"default_attack"\t\t""`,
      );
      fixed = fixed.replaceAll(
        `\t\t"AbilityValues"\r\n\t\t""`,
        `\t\t"AbilityValues"\t\t""`,
      );
      fixed = fixed.replaceAll(
        `\t\t\t\t"spill_movement_slow_pct"\r\n\t\t\t\t""`,
        `\t\t\t\t"default_attack"\r\n\t\t\t\t{}`,
      );
      // fs.writeFileSync('./test.txt', fixed);
      let vdf = vdfparser.parse(fixed, { types: false, arrayify: true });
      return vdf;
    } catch (e) {
      console.error("Couldn't parse JSON or VDF", url);
      throw e;
    }
  }
}
