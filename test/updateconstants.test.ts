import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import fixture from "./fixtures/talent-values-6942.json" with { type: "json" };
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
      dname: "+{s:bonus_speed_duration}s Culling Blade Kill Buff Bonus Duration",
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

  resolveSpecialBonusPlaceholders(abilities, {});

  assert.equal(
    abilities.special_bonus_unique_juggernaut_2.dname,
    "+{s:bonus_healing_ward_bonus_health} Healing Ward Hits to Kill",
  );
});
