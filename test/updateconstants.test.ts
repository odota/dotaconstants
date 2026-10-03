import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import fixture from "./fixtures/talent-values-6942.json" with { type: "json" };
import { analyzeSpecialBonusValues } from "../tasks/util.ts";
import { applyLegacyTalentNames } from "../tasks/legacytalents.ts";
import {
  abilityNameStrings,
  buildAbilityIds,
  buildSpecialBonusLookup,
  resolveSpecialBonusPlaceholders,
  validateCurrentTalents,
} from "../tasks/util.ts";

test("resolves a talent placeholder after its linked ability is processed", () => {
  const abilities = {
    special_bonus_unique_axe_culling_blade_speed_duration: {
      dname:
        "+{s:bonus_speed_duration}s Culling Blade Kill Buff Bonus Duration",
    },
  };
  const lookup = {
    special_bonus_unique_axe_culling_blade_speed_duration: {
      bonus_speed_duration: "3",
      value: "3",
    },
  };

  resolveSpecialBonusPlaceholders(abilities, lookup);

  assert.equal(
    abilities.special_bonus_unique_axe_culling_blade_speed_duration.dname,
    "+3s Culling Blade Kill Buff Bonus Duration",
  );
});

test("all modifiers are collected even after a facet, without mutating scripts", () => {
  const scripts = {
    spell: {
      AbilityValues: {
        AbilityCooldown: {
          value: "12",
          special_bonus_facet_variant: "=6",
          special_bonus_first: "-2",
          special_bonus_second: "-3",
        },
      },
    },
  };
  const original = structuredClone(scripts);
  const lookup = buildSpecialBonusLookup(scripts);
  assert.equal(lookup.special_bonus_first.bonus_abilitycooldown, "2");
  assert.equal(lookup.special_bonus_second.bonus_abilitycooldown, "3");
  assert.deepEqual(scripts, original);
});

test("real client templates resolve percent, decimal, repeated, multiple and mixed-case values", () => {
  const expected = {
    special_bonus_unique_primal_beast_colossal_trample:
      "Colossal 2x Bonuses During Trample",
    special_bonus_unique_largo_1: "+15 Frogstomp Damage",
    special_bonus_unique_pudge_7: "+150 Meat Hook Damage",
    special_bonus_unique_venomancer_2: "+10% Poison Sting Slow",
    special_bonus_unique_bristleback_3: "+18 Warpath Damage Per Stack",
    special_bonus_unique_kunkka_tidebringer_slow:
      "Tidebringer applies 60% slow for 1s",
    special_bonus_unique_clinkz_9: "-10s Death Pact Charge Restore Time",
    special_bonus_unique_lycan_2: "-25% Summon Wolves BAT",
    special_bonus_unique_slark_4: "+20s Essence Shift Duration",
    special_bonus_unique_storm_spirit_overload_aspd:
      "+25.0/25.0% Overload Attack/Movement Speed Slow",
    special_bonus_unique_silencer_arcane_curse_duration:
      "+2s/+1s Arcane Curse Base/Penalty Duration",
    special_bonus_unique_sniper_shrapnel_damage: "+30% Shrapnel Damage",
    special_bonus_unique_meepo_poof_cast_point: "-.75s Poof Cast Duration",
    special_bonus_unique_ancient_apparition_6: "+50% Death Rime Slow/Damage",
    special_bonus_unique_ancient_apparition_8:
      "+1.0 Death Rime Strength Reduction",
    special_bonus_unique_windranger_8: "-10% Focus Fire Damage Reduction",
  };
  const strings = abilityNameStrings(fixture.tokens);
  const abilities = Object.fromEntries(
    Object.keys(expected).map((name) => [
      name,
      { dname: strings[`dota_tooltip_ability_${name}`] },
    ]),
  );
  resolveSpecialBonusPlaceholders(
    abilities,
    buildSpecialBonusLookup(fixture.scripts),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(abilities).map(([name, data]) => [name, data.dname]),
    ),
    expected,
  );
});

test("own values retain negative signs and zero; modifier operators belong to the localization", () => {
  const lookup = buildSpecialBonusLookup({
    special_bonus_own: {
      AbilityValues: { value: "-0.5", zero: { value: "0" }, levels: "1 2 3" },
    },
    spell: {
      AbilityValues: {
        chance: { special_bonus_percent: "+30%" },
        multiplier: { special_bonus_multiplier: "x2" },
        duration: { special_bonus_replace: "=4" },
      },
    },
  });
  const abilities = {
    special_bonus_own: { dname: "{s:value}/{s:zero}: {s:levels}" },
    special_bonus_percent: { dname: "+{s:bonus_chance}%" },
    special_bonus_multiplier: { dname: "{s:bonus_multiplier}x" },
    special_bonus_replace: { dname: "{s:bonus_duration}s" },
  };
  resolveSpecialBonusPlaceholders(abilities, lookup);
  assert.equal(abilities.special_bonus_own.dname, "-0.5/0: 1 / 2 / 3");
  assert.equal(abilities.special_bonus_percent.dname, "+30%");
  assert.equal(abilities.special_bonus_multiplier.dname, "2x");
  assert.equal(abilities.special_bonus_replace.dname, "4s");
});

test("preferred equipped spells resolve conflicting legacy values independently of order", () => {
  const active = {
    AbilityValues: { radius: { special_bonus_radius: "+125" } },
  };
  const bear = { AbilityValues: { radius: { special_bonus_radius: "+150" } } };
  for (const scripts of [
    { active, bear },
    { bear, active },
  ]) {
    assert.equal(
      buildSpecialBonusLookup(scripts, new Set(["active"])).special_bonus_radius
        .bonus_radius,
      "125",
    );
    assert.equal(
      buildSpecialBonusLookup(scripts).special_bonus_radius.bonus_radius,
      undefined,
    );
  }
});

test("current talents take priority over reused historical IDs; current collisions fail", () => {
  assert.deepEqual(
    buildAbilityIds({ current: "323", legacy: "323" }, new Set(["current"])),
    { 323: "current" },
  );
  assert.deepEqual(
    buildAbilityIds({ legacy: "323", current: "323" }, new Set(["current"])),
    { 323: "current" },
  );
  assert.throws(
    () =>
      buildAbilityIds(
        { first: "323", second: "323" },
        new Set(["first", "second"]),
      ),
    /share ID 323/,
  );
});

test("real inactive Kunkka and Disruptor conflicts retain templates independently of source order", () => {
  const templates = {
    special_bonus_unique_kunkka_rum:
      "+{s:bonus_ghostship_absorb}% Admiral's Rum Damage Delayed",
    special_bonus_unique_disruptor_kinetic_damage:
      "+{s:bonus_damage_per_second} Kinetic Field Touch DPS",
  };
  const names = abilityNameStrings(fixture.tokens);
  for (const entries of [
    Object.entries(fixture.scripts),
    Object.entries(fixture.scripts).toReversed(),
  ]) {
    const abilities = Object.fromEntries(
      Object.keys(templates).map((name) => [
        name,
        { dname: names[`dota_tooltip_ability_${name}`] },
      ]),
    );
    resolveSpecialBonusPlaceholders(
      abilities,
      buildSpecialBonusLookup(Object.fromEntries(entries)),
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(abilities).map(([name, data]) => [name, data.dname]),
      ),
      templates,
    );
  }
});

test("current missing IDs, names and unresolved variables are actionable validation errors", () => {
  assert.deepEqual(
    validateCurrentTalents(
      new Set(["special_bonus_missing", "special_bonus_template"]),
      { special_bonus_template: { dname: "+{s:value}%" } },
      { 1: "special_bonus_template" },
    ),
    [
      "Missing talent ID: special_bonus_missing",
      "Missing talent name: special_bonus_missing",
      "Unresolved talent name: special_bonus_template: +{s:value}%",
    ],
  );
});

test("every generated current hero talent has an ID and a fully resolved name", () => {
  const load = (name: string) =>
    JSON.parse(
      fs.readFileSync(
        new URL(`../build/${name}.json`, import.meta.url),
        "utf8",
      ),
    );
  const talents = new Set<string>(
    Object.values(load("hero_abilities")).flatMap((hero: any) =>
      hero.talents
        .map((talent: any) => talent.name)
        .filter((name: string) => name.startsWith("special_bonus")),
    ),
  );
  assert.deepEqual(
    validateCurrentTalents(talents, load("abilities"), load("ability_ids")),
    [],
  );
});

test("keeps a placeholder when the current source data has no value for it", () => {
  const abilities = {
    special_bonus_unique_juggernaut_2: {
      dname: "+{s:bonus_healing_ward_bonus_health} Healing Ward Hits to Kill",
    },
  };

  resolveSpecialBonusPlaceholders(
    abilities,
    buildSpecialBonusLookup(fixture.scripts),
  );

  assert.equal(
    abilities.special_bonus_unique_juggernaut_2.dname,
    "+{s:bonus_healing_ward_bonus_health} Healing Ward Hits to Kill",
  );
});

test("modifier objects keep explicit base values and diagnose conditional-only values in both formats", () => {
  for (const format of ["AbilityValues", "AbilitySpecial"]) {
    const values = {
      damage: {
        value: "100",
        special_bonus_string: "+10",
        special_bonus_object: { value: "+12", special_bonus_scepter: "+20" },
        special_bonus_conditional: { special_bonus_scepter: "+10" },
        special_bonus_bad: { mystery: "+99" },
        special_bonus_empty: {},
        special_bonus_array: ["+10"],
      },
    };
    const scripts = {
      spell: {
        [format]:
          format === "AbilityValues"
            ? values
            : { "01": { var_type: "FIELD_INTEGER", ...values } },
      },
    };
    const original = structuredClone(scripts);
    const result = analyzeSpecialBonusValues(scripts);
    assert.equal(result.lookup.special_bonus_string.bonus_damage, "10");
    assert.equal(result.lookup.special_bonus_object.bonus_damage, "12");
    assert.equal(
      result.lookup.special_bonus_conditional?.bonus_damage,
      undefined,
    );
    assert.equal(result.lookup.special_bonus_scepter, undefined);
    assert.ok(
      result.candidates.some(
        (c) =>
          c.talent === "special_bonus_conditional" &&
          c.condition === "base/special_bonus_scepter" &&
          c.display === "10",
      ),
    );
    for (const talent of [
      "special_bonus_bad",
      "special_bonus_empty",
      "special_bonus_array",
    ])
      assert.ok(result.candidates.some((c) => c.talent === talent && c.reason));
    assert.deepEqual(scripts, original);
  }
});

test("repeated AbilitySpecial attributes collect all modifiers without overwriting entries", () => {
  const lookup = buildSpecialBonusLookup({
    spell: {
      AbilitySpecial: {
        "01": { damage: { special_bonus_first: "+10" } },
        "02": { damage: { special_bonus_second: "+20" } },
      },
    },
  });
  assert.equal(lookup.special_bonus_first.bonus_damage, "10");
  assert.equal(lookup.special_bonus_second.bonus_damage, "20");
});

const twoCandidates = (first: unknown, second: unknown) => ({
  first: { AbilityValues: { damage: { special_bonus_demo: first } } },
  second: { AbilityValues: { damage: { special_bonus_demo: second } } },
});

test("equivalent numeric spellings resolve deterministically with positional multivalues", () => {
  for (const [a, b, expected] of [
    ["+10", "+10.0", "10"],
    ["+.50%", "+0.500%", ".50"],
    ["+1.0 -2.00 +.5", "+1 -2 +0.50", "1 2 0.50"],
    ["+-0.1", "+-0.10", "-0.1"],
    ["=0010", "=10.0", "0010"],
  ]) {
    for (const scripts of [twoCandidates(a, b), twoCandidates(b, a)]) {
      const result = analyzeSpecialBonusValues(scripts);
      assert.equal(result.lookup.special_bonus_demo.bonus_damage, expected);
      assert.equal(result.conflicts.length, 0);
      assert.ok(result.equivalents.length > 0);
    }
  }
});

test("equivalent values and object field traversal produce the same lookup", () => {
  const entries = [
    [
      "damage",
      { special_bonus_demo: { value: "+10.0", special_bonus_scepter: "+15" } },
    ],
    [
      "DAMAGE",
      { special_bonus_demo: { special_bonus_scepter: "+15", value: "+10" } },
    ],
  ];
  const forward = buildSpecialBonusLookup({
    spell: { AbilityValues: Object.fromEntries(entries) },
  });
  const reverse = buildSpecialBonusLookup({
    spell: { AbilityValues: Object.fromEntries(entries.toReversed()) },
  });
  assert.deepEqual(forward, reverse);
  assert.equal(forward.special_bonus_demo.bonus_damage, "10");
});

test("distinct numbers, operation, unit, sequence positions and precise decimals remain conflicts", () => {
  for (const [a, b] of [
    ["+10", "+15"],
    ["+10", "-10"],
    ["+10", "=10"],
    ["x10", "10"],
    ["+10%", "+10"],
    ["+1 +2", "+2 +1"],
    ["+9007199254740992", "+9007199254740993"],
    ["+.100000000000000001", "+.1"],
  ]) {
    for (const scripts of [twoCandidates(a, b), twoCandidates(b, a)]) {
      const result = analyzeSpecialBonusValues(scripts);
      assert.equal(result.lookup.special_bonus_demo.bonus_damage, undefined);
      assert.ok(result.conflicts.length > 0);
    }
  }
});

test("invalid values cannot silently discard a competing candidate", () => {
  for (const invalid of [
    "10junk",
    "10%0",
    "++10",
    "--10",
    "NaN",
    "Infinity",
    "1e2",
    "",
    "10 20x",
    null,
    10,
  ]) {
    const result = analyzeSpecialBonusValues(twoCandidates("+10", invalid));
    assert.equal(result.lookup.special_bonus_demo.bonus_damage, undefined);
    assert.ok(result.candidates.some((c) => c.reason === "invalid-value"));
  }
});

test("conditional-only values never merge with base values or reveal a lower-priority obsolete base", () => {
  const scripts = twoCandidates("+10", { special_bonus_scepter: "+10.0" });
  for (const preferred of [new Set<string>(), new Set(["second"])]) {
    const result = analyzeSpecialBonusValues(scripts, preferred);
    assert.equal(result.lookup.special_bonus_demo?.bonus_damage, undefined);
    assert.ok(result.candidates.some((c) => c.reason === "conditional-only"));
  }
});

test("own definition beats preferred hero spells and other spells in either order", () => {
  const scripts = {
    special_bonus_demo: { AbilityValues: { bonus_damage: { value: "7" } } },
    ...twoCandidates("+10", "+15"),
  };
  for (const input of [
    scripts,
    Object.fromEntries(Object.entries(scripts).toReversed()),
  ])
    assert.equal(
      buildSpecialBonusLookup(input, new Set(["first"])).special_bonus_demo
        .bonus_damage,
      "7",
    );
});

test("current names reject missing, blank and invalid types without altering normal contents", () => {
  for (const dname of [undefined, "", " \t ", null, 10, [], {}])
    assert.deepEqual(
      validateCurrentTalents(
        new Set(["talent"]),
        { talent: { dname } },
        { 1: "talent" },
      ),
      ["Missing talent name: talent"],
    );
  const abilities = { talent: { dname: " +10 Damage " } };
  assert.deepEqual(
    validateCurrentTalents(new Set(["talent"]), abilities, { 1: "talent" }),
    [],
  );
  assert.equal(abilities.talent.dname, " +10 Damage ");
});

test("placeholder prefix and keys are case-insensitive and repeated occurrences resolve", () => {
  const abilities = { talent: { dname: "{S:VaLuE}s +{s:VALUE}s" } };
  resolveSpecialBonusPlaceholders(abilities, { talent: { value: "1.5" } });
  assert.equal(abilities.talent.dname, "1.5s +1.5s");
});

test("real signed operands from client 6942 retain negative modifier values", () => {
  const abilities = {
    special_bonus_unique_pudge_4: { dname: "+{s:bonus_rot_slow}% Rot Slow" },
    special_bonus_unique_razor_2: {
      dname: "-{s:bonus_strike_interval}s Eye of the Storm Strike Interval",
    },
    special_bonus_unique_vengeful_spirit_4: {
      dname: "-{s:bonus_armor_reduction} Wave of Terror Armor",
    },
  };
  resolveSpecialBonusPlaceholders(
    abilities,
    buildSpecialBonusLookup(fixture.scripts),
  );
  assert.equal(abilities.special_bonus_unique_pudge_4.dname, "+10% Rot Slow");
  assert.equal(
    abilities.special_bonus_unique_razor_2.dname,
    "-0.1s Eye of the Storm Strike Interval",
  );
  assert.equal(
    abilities.special_bonus_unique_vengeful_spirit_4.dname,
    "-3 Wave of Terror Armor",
  );
});

test("real historical conflicts retain published labels only as legacy fallbacks", () => {
  const abilities = {
    special_bonus_unique_kunkka_rum: {
      dname: "+{s:bonus_ghostship_absorb}% Admiral's Rum Damage Delayed",
    },
    special_bonus_unique_disruptor_kinetic_damage: {
      dname: "+{s:bonus_damage_per_second} Kinetic Field Touch DPS",
    },
  };
  resolveSpecialBonusPlaceholders(
    abilities,
    buildSpecialBonusLookup(fixture.scripts),
  );
  const report = applyLegacyTalentNames(abilities, new Set());
  assert.equal(report.length, 2);
  assert.ok(report.every((entry) => entry.sourceName?.includes("{s:")));
  assert.equal(
    abilities.special_bonus_unique_kunkka_rum.dname,
    "+8% Admiral's Rum Damage Delayed",
  );
  assert.equal(
    abilities.special_bonus_unique_disruptor_kinetic_damage.dname,
    "+60 Kinetic Field Touch DPS",
  );
});

test("legacy policy applies to any inactive record, preserves reliable names and excludes current talents", () => {
  const abilities = {
    special_bonus_current: { dname: "+{s:value}%" },
    special_bonus_conflict: { dname: "+{s:value} Damage" },
    special_bonus_missing: {},
    special_bonus_unresolved: { dname: "+{s:value} Speed" },
    special_bonus_reliable: { dname: "+20 Armor" },
  };
  const labels = {
    special_bonus_current: "+10%",
    special_bonus_conflict: "+10 Damage",
    special_bonus_missing: "+5 Speed",
    special_bonus_unresolved: "+{s:value} Speed",
    special_bonus_reliable: "+10 Armor",
  };
  assert.deepEqual(
    applyLegacyTalentNames(
      abilities,
      new Set(["special_bonus_current"]),
      labels,
    ).map((entry) => entry.name),
    ["special_bonus_conflict", "special_bonus_missing"],
  );
  assert.equal(abilities.special_bonus_current.dname, "+{s:value}%");
  assert.equal(abilities.special_bonus_reliable.dname, "+20 Armor");
  assert.equal(abilities.special_bonus_unresolved.dname, "+{s:value} Speed");
});
