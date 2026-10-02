import assert from "node:assert/strict";
import test from "node:test";
import {
  auditHeroTalentLists,
  findUnnamedInactiveTalents,
} from "../tasks/auditutil.ts";
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

test("inactive missing-name diagnostics include absent and blank names without treating unresolved names as missing", () => {
  const abilities = {
    special_bonus_missing: {},
    special_bonus_empty: { dname: "" },
    special_bonus_blank: { dname: " \t " },
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
    ],
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
