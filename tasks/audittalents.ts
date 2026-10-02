import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  auditHeroTalentLists,
  findUnnamedInactiveTalents,
} from "./auditutil.ts";
import {
  describeGameSource,
  loadHeroes,
  parseJsonOrVdf,
  readGameFile,
  resolveGameSourceRef,
} from "./source.ts";
import {
  abilityNameStrings,
  buildAbilityIds,
  buildSpecialBonusLookup,
  getReferencedHeroTalents,
  resolveSpecialBonusPlaceholders,
  validateCurrentTalents,
} from "./util.ts";

const ref = await resolveGameSourceRef();
const sourceFiles = [
  "scripts/npc/npc_abilities.txt",
  "scripts/npc/npc_ability_ids.txt",
  "resource/localization/abilities_english.txt",
  "steam.inf",
];
const [allHeroes, ...texts] = await Promise.all([
  loadHeroes(ref),
  ...sourceFiles.map((file) => readGameFile(ref, file)),
]);
const heroes = Object.fromEntries(
  Object.entries(allHeroes.DOTAHeroes).filter(
    ([name, hero]: [string, any]) =>
      hero.HeroID &&
      !["npc_dota_hero_base", "npc_dota_hero_target_dummy"].includes(name),
  ),
);
const scripts = Object.assign(
  {},
  parseJsonOrVdf(texts[0], sourceFiles[0]).DOTAAbilities,
  ...Object.values(heroes).map((hero: any) => hero.AbilityDefinitions ?? {}),
);
const locked = parseJsonOrVdf(texts[1], sourceFiles[1]).DOTAAbilityIDs
  .UnitAbilities.Locked;
const tokens = parseJsonOrVdf(texts[2], sourceFiles[2]).lang.Tokens;
const preferred = new Set<string>(
  Object.values(heroes).flatMap((hero: any) =>
    Object.entries(hero)
      .filter(([key]) => /^Ability\d+$/.test(key))
      .map(([, value]) => String(value)),
  ),
);
const talents = getReferencedHeroTalents(heroes);
const names = abilityNameStrings(tokens);
const expected = Object.fromEntries(
  [...talents].map((name) => [
    name,
    { dname: names[`dota_tooltip_ability_${name}`] },
  ]),
);
resolveSpecialBonusPlaceholders(
  expected,
  buildSpecialBonusLookup(scripts, preferred),
);
const readBuild = (key: string) =>
  JSON.parse(fs.readFileSync(`build/${key}.json`, "utf8"));
const abilities = readBuild("abilities");
const abilityIds = readBuild("ability_ids");
const heroAbilities = readBuild("hero_abilities");
const errors = validateCurrentTalents(talents, abilities, abilityIds);
for (const talent of talents) {
  if (abilities[talent]?.dname !== expected[talent].dname)
    errors.push(`Talent name differs from source: ${talent}`);
  if (abilityIds[locked[talent]] !== talent)
    errors.push(`Talent ID differs from source: ${talent}`);
}
errors.push(...auditHeroTalentLists(heroes, heroAbilities));
const idGroups: Record<string, string[]> = {};
for (const [name, id] of Object.entries(locked))
  (idGroups[String(id)] ??= []).push(name);
const duplicateIds = Object.entries(idGroups).filter(
  ([, group]) => group.length > 1,
);
const historicalAliases: { id: string; name: string; currentName: string }[] =
  [];
for (const [id, group] of duplicateIds) {
  const current = group.filter((name) => talents.has(name));
  if (current.length === 1) {
    for (const name of group.filter((name) => name !== current[0]))
      historicalAliases.push({ id, name, currentName: current[0] });
  } else if (!(
    id === "0" &&
    group.length === 2 &&
    group.includes("ability_base") &&
    group.includes("dota_base_ability")
  ))
    errors.push(`Ambiguous source ability ID ${id}: ${group.join(", ")}`);
}
for (const [id, name] of Object.entries(buildAbilityIds(locked, talents))) {
  if (abilityIds[id] !== name)
    errors.push(`Ability ID mismatch: ${id}: ${name}`);
}
for (const [id, name] of Object.entries(abilityIds))
  if (String(locked[String(name)]) !== id)
    errors.push(`Ability ID absent from source: ${id}: ${name}`);

const inactiveTalents = Object.entries(abilities)
  .filter(
    ([name, data]: [string, any]) =>
      name.startsWith("special_bonus") &&
      !talents.has(name) &&
      /\{[^}]+\}/.test(data.dname ?? ""),
  )
  .map(([name, data]: [string, any]) => ({ name, dname: data.dname }));
const sourceDescription = describeGameSource(ref, sourceFiles);
const report = {
  source: {
    ...sourceDescription,
    sha256Input:
      "UTF-8 text with the initial BOM removed; line endings preserved",
    clientVersion: Number(texts[3].match(/^ClientVersion=(\d+)/m)?.[1]),
    files: sourceDescription.files.map((location, index) => ({
      ...location,
      sha256: createHash("sha256").update(texts[index]).digest("hex"),
    })),
  },
  talents: {
    heroes: Object.keys(heroes).length,
    uniqueCurrentTalents: talents.size,
    listChecks:
      "Length, duplicate entries, declaration order and existing export level convention; not in-game learning levels",
    currentSlots: Object.values(heroes).reduce(
      (sum: number, hero: any) => sum + getReferencedHeroTalents({ hero }).size,
      0,
    ),
    errors: errors.filter((error) => /talent/i.test(error)),
    unresolvedInactiveTalents: inactiveTalents,
    unnamedInactiveTalents: findUnnamedInactiveTalents(abilities, talents),
  },
  abilityIds: {
    sourceEntries: Object.keys(locked).length,
    builtEntries: Object.keys(abilityIds).length,
    duplicateSourceIds: duplicateIds,
    historicalAliases,
    idsWithoutAbilityData: Object.entries(abilityIds)
      .filter(([, name]) => !abilities[String(name)])
      .map(([id, name]) => ({ id: Number(id), name })),
  },
  errors,
};
const outputIndex = process.argv.indexOf("--output");
if (outputIndex !== -1)
  fs.writeFileSync(
    process.argv[outputIndex + 1],
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(
  JSON.stringify(
    {
      source: ref,
      sourceMode: report.source.mode,
      sourceVerification: report.source.verification,
      verifiedRef: report.source.verifiedRef,
      clientVersion: report.source.clientVersion,
      heroes: report.talents.heroes,
      talentSlots: report.talents.currentSlots,
      uniqueTalents: talents.size,
      abilityIds: report.abilityIds.builtEntries,
      inactiveUnresolved: inactiveTalents.length,
      inactiveUnnamed: report.talents.unnamedInactiveTalents.length,
      errors,
    },
    null,
    2,
  ),
);
if (errors.length) process.exitCode = 1;
