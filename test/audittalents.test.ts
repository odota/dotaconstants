import assert from "node:assert/strict";
import test from "node:test";
import {
  auditHeroTalentLists,
  findUnnamedInactiveTalents,
  scanTalentStructures,
  classifyTalentName,
  findTalentLocalizationMetadata,
} from "../tasks/auditutil.ts";
import {
  abilityNameStrings,
  analyzeSpecialBonusValues,
} from "../tasks/util.ts";
import fixture from "./fixtures/talent-values-6942.json" with { type: "json" };

const hero = "npc_dota_hero_antimage";
// Explicit expected serialization, not calculated by the generator under test.
const talents = [
  { name: "special_bonus_hp_regen_3", level: 1 },
  { name: "special_bonus_unique_antimage_manavoid_aoe", level: 1 },
  { name: "special_bonus_unique_antimage_5", level: 2 },
  { name: "special_bonus_unique_antimage_6", level: 2 },
  { name: "special_bonus_unique_antimage_3", level: 3 },
  { name: "special_bonus_unique_antimage_8", level: 3 },
  { name: "special_bonus_unique_antimage", level: 4 },
  { name: "special_bonus_unique_antimage_2", level: 4 },
];
const audit = (entries: unknown) =>
  auditHeroTalentLists(fixture.heroes, { [hero]: { talents: entries } });

test("pinned tooltip descriptions and notes are metadata, not missing historical values", () => {
  const abilities = Object.fromEntries(
    Object.entries(fixture.localizationMetadata.strings).map(([key, dname]) => [
      key.slice("DOTA_Tooltip_ability_".length),
      { dname },
    ]),
  );
  const before = structuredClone(abilities);
  const metadata = findTalentLocalizationMetadata(
    abilities,
    new Set(),
    {},
    abilityNameStrings(fixture.localizationMetadata.strings),
  );
  assert.deepEqual(
    metadata.map(({ name, kind, parent }) => ({ name, kind, parent })),
    [
      {
        name: "special_bonus_unique_clinkz_2_Note0",
        kind: "note",
        parent: "special_bonus_unique_clinkz_2",
      },
      {
        name: "special_bonus_unique_tidehunter_10_description",
        kind: "description",
        parent: "special_bonus_unique_tidehunter_10",
      },
      {
        name: "special_bonus_unique_tidehunter_smash_on_blubber_description",
        kind: "description",
        parent: "special_bonus_unique_tidehunter_smash_on_blubber",
      },
      {
        name: "special_bonus_unique_tinker_deploy_turrets_splash_radius_description",
        kind: "description",
        parent: "special_bonus_unique_tinker_deploy_turrets_splash_radius",
      },
      {
        name: "special_bonus_unique_chen_2_description",
        kind: "description",
        parent: "special_bonus_unique_chen_2",
      },
    ],
  );
  assert.equal(
    metadata.filter((entry) => /\{s:/.test(entry.sourceName)).length,
    3,
  );
  assert.deepEqual(abilities, before);
});

test("metadata suffixes are case-insensitive and require localization evidence without overriding talent references or definitions", () => {
  const abilities = {
    special_bonus_demo_Description: { dname: "Description" },
    special_bonus_demo_nOtE12: { dname: "Note" },
    special_bonus_current_description: { dname: "Current talent" },
    special_bonus_defined_note0: { dname: "Defined talent" },
    special_bonus_unlocalized_description: { dname: "No source token" },
    special_bonus_demo_description_extra: { dname: "Different suffix" },
    ordinary_spell_description: { dname: "Ordinary tooltip" },
  };
  const names = Object.fromEntries(
    Object.entries(abilities)
      .filter(([name]) => name !== "special_bonus_unlocalized_description")
      .map(([name, data]) => [
        `dota_tooltip_ability_${name}`.toLowerCase(),
        data.dname,
      ]),
  );
  assert.deepEqual(
    findTalentLocalizationMetadata(
      abilities,
      new Set(["special_bonus_current_description"]),
      { special_bonus_defined_note0: {} },
      names,
    ).map((entry) => entry.name),
    ["special_bonus_demo_Description", "special_bonus_demo_nOtE12"],
  );
});

test("missing-name diagnostics exclude identified metadata but retain actual inactive records", () => {
  const abilities = {
    special_bonus_demo_description: {},
    special_bonus_missing: {},
    special_bonus_current: {},
  };
  const current = new Set(["special_bonus_current"]);
  const metadata = findTalentLocalizationMetadata(
    abilities,
    current,
    {},
    {
      dota_tooltip_ability_special_bonus_demo_description:
        "Tooltip description",
    },
  );
  assert.deepEqual(
    findUnnamedInactiveTalents(
      abilities,
      current,
      new Set(metadata.map((entry) => entry.name)),
    ),
    [{ name: "special_bonus_missing" }],
  );
});

test("inactive missing-name diagnostics include absent and blank names without treating unresolved names as missing", () => {
  const abilities = {
    special_bonus_missing: {},
    special_bonus_empty: { dname: "" },
    special_bonus_blank: { dname: " \t " },
    special_bonus_invalid: { dname: 42 },
    special_bonus_template: { dname: "+{s:value}%" },
    special_bonus_named: { dname: "+10 Damage" },
    special_bonus_current: {},
    ordinary_spell: {},
  };
  assert.deepEqual(
    findUnnamedInactiveTalents(abilities, new Set(["special_bonus_current"])),
    [
      { name: "special_bonus_missing" },
      { name: "special_bonus_empty" },
      { name: "special_bonus_blank" },
      { name: "special_bonus_invalid" },
    ],
  );
});

test("audit scans all modifiers and separates adjacency, nested objects and missing evidence", () => {
  const scripts = {
    spell: {
      AbilityValues: {
        damage: {
          special_bonus_facet_demo: "=100",
          special_bonus_first: "+10",
          special_bonus_second: { special_bonus_scepter: "+20" },
        },
      },
    },
  };
  const classes = scanTalentStructures(scripts);
  assert.equal(classes.multiple.length, 1);
  assert.equal(classes.adjacent.length, 1);
  assert.equal(classes.objects.length, 1);
  const analysis = analyzeSpecialBonusValues(scripts);
  assert.deepEqual(
    classifyTalentName(
      "special_bonus_second",
      "+{s:bonus_damage}",
      analysis.candidates,
      scripts,
      new Set(),
    ),
    ["absent-definition", "conditional-only"],
  );
  assert.deepEqual(
    classifyTalentName(
      "special_bonus_deleted",
      "+{s:value}",
      analysis.candidates,
      scripts,
      new Set(["special_bonus_deleted"]),
    ),
    ["commented-definition", "missing-source-value"],
  );
  assert.deepEqual(
    classifyTalentName(
      "special_bonus_template",
      undefined,
      analysis.candidates,
      scripts,
      new Set(),
    ),
    ["missing-template"],
  );
});

test("audit reports conflicts and malformed source candidates rather than calling them resolved", () => {
  const scripts = {
    first: { AbilityValues: { damage: { special_bonus_demo: "+10" } } },
    second: { AbilityValues: { damage: { special_bonus_demo: "+15" } } },
  };
  const analysis = analyzeSpecialBonusValues(scripts);
  assert.deepEqual(
    classifyTalentName(
      "special_bonus_demo",
      "+{s:bonus_damage}",
      analysis.candidates,
      scripts,
      new Set(),
    ),
    ["absent-definition", "conflicting-source-values"],
  );
});

test("pinned Anti-Mage declaration matches the existing talent export convention", () => {
  assert.deepEqual(audit(talents), []);
});

test("talent audit rejects reversed order even when the name set is unchanged", () => {
  assert.ok(
    audit(talents.toReversed()).some((error) =>
      error.includes("order/reference"),
    ),
  );
});

test("talent audit rejects level 99 and string levels", () => {
  for (const level of [99, "1"]) {
    const modified = structuredClone(talents) as any[];
    modified[0].level = level;
    assert.ok(audit(modified).some((error) => error.includes("export level")));
  }
});

test("talent audit detects duplicate additions and replacements", () => {
  for (const modified of [
    [...talents, talents[0]],
    [talents[0], talents[0], ...talents.slice(2)],
  ]) {
    assert.ok(audit(modified).some((error) => error.includes("Duplicate")));
  }
  assert.ok(
    audit([...talents, talents[0]]).some((error) =>
      error.includes("count differs"),
    ),
  );
});

test("talent audit rejects missing lists and invalid entries", () => {
  assert.ok(audit(undefined).some((error) => error.includes("Missing")));
  assert.ok(
    audit([null, ...talents.slice(1)]).some((error) =>
      error.includes("Invalid"),
    ),
  );
});

test("talent audit respects a custom start and retains hidden slots in the export convention", () => {
  const source = {
    custom: {
      AbilityTalentStart: "12",
      Ability10: "ordinary_spell",
      Ability12: "special_bonus_first",
      Ability13: "generic_hidden",
      Ability14: "special_bonus_second",
      Ability15: "",
    },
  };
  assert.deepEqual(
    auditHeroTalentLists(source, {
      custom: {
        talents: [
          { name: "special_bonus_first", level: 1 },
          { name: "generic_hidden", level: 1 },
          { name: "special_bonus_second", level: 2 },
        ],
      },
    }),
    [],
  );
});
