import assert from "node:assert/strict";
import test from "node:test";

import {
  abilityNameStrings,
  buildSpecialBonusLookup,
  resolveSpecialBonusPlaceholders,
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

test("collects every talent after upgrade fields without changing the input", () => {
  const scripts = {
    spell: {
      AbilityValues: {
        damage: {
          value: "100",
          special_bonus_facet_variant: "=80",
          special_bonus_scepter: "+20",
          special_bonus_shard: "+5",
          special_bonus_first: "+30%",
          special_bonus_second: "+18",
        },
      },
    },
  };
  const original = structuredClone(scripts);
  const lookup = buildSpecialBonusLookup(scripts);
  assert.equal(lookup.special_bonus_first.bonus_damage, "30");
  assert.equal(lookup.special_bonus_second.bonus_damage, "18");
  assert.deepEqual(Object.keys(lookup), [
    "special_bonus_first",
    "special_bonus_second",
  ]);
  assert.deepEqual(scripts, original);
});

test("collects legacy AbilitySpecial attributes and preserves modifier compatibility", () => {
  const lookup = buildSpecialBonusLookup({
    spell: {
      AbilitySpecial: {
        "01": {
          var_type: "FIELD_FLOAT",
          duration: {
            value: "6",
            special_bonus_duration: "-0.75",
          },
        },
        "02": {
          var_type: "FIELD_INTEGER",
          damage: {
            value: "0",
            special_bonus_damage: { special_bonus_scepter: "+40" },
          },
        },
      },
    },
    special_bonus_own: {
      AbilitySpecial: {
        "01": { var_type: "FIELD_FLOAT", value: "-0.1" },
      },
    },
  });
  assert.equal(lookup.special_bonus_duration.bonus_duration, "0.75");
  assert.equal(lookup.special_bonus_damage.bonus_damage, "40");
  assert.deepEqual(lookup.special_bonus_own, { value: "-0.1" });
});

test("keeps modifier overwrite precedence and talent-owned values", () => {
  const lookup = buildSpecialBonusLookup({
    first: { AbilityValues: { damage: { special_bonus_damage: "+50" } } },
    second: { AbilityValues: { damage: { special_bonus_damage: "+60" } } },
    special_bonus_damage: { AbilityValues: { value: "70" } },
  });
  assert.equal(lookup.special_bonus_damage.bonus_damage, "60");
  assert.equal(lookup.special_bonus_damage.value, "70");
});

// Matching excerpts from d2vpkr client 6942 (Valve game data):
// https://github.com/dotabuff/d2vpkr/tree/cf0d37a32c8df338a7832fd32a282747969e9a5f/dota
// One skill deliberately has no name token; collection must still include it.
test("fills real mixed-case and percent templates, including an unlocalized ability", () => {
  const scripts = {
    silencer_curse_of_the_silent: {
      AbilityValues: {
        duration: {
          value: "6",
          special_bonus_unique_silencer_arcane_curse_duration: "+2",
        },
        penalty_duration: {
          value: "2",
          special_bonus_unique_silencer_arcane_curse_duration: "+1",
        },
      },
    },
    clinkz_death_pact: {
      AbilityValues: {
        AbilityChargeRestoreTime: {
          value: "40",
          special_bonus_facet_clinkz_engulfing_step: "-10",
          special_bonus_unique_clinkz_9: "-10",
        },
      },
    },
    ancient_apparition_death_rime: {
      AbilityValues: {
        damage: {
          value: "10",
          special_bonus_unique_ancient_apparition_6: "+50%",
        },
      },
    },
  };
  const tokens = abilityNameStrings({
    Dota_Tooltip_ability_special_bonus_unique_silencer_arcane_curse_duration:
      "+{s:bonus_duration}s/+{s:bonus_penalty_duration}s Arcane Curse Base/Penalty Duration",
    DOTA_Tooltip_ability_special_bonus_unique_clinkz_9:
      "-{s:bonus_AbilityChargeRestoreTime}s Death Pact Charge Restore Time",
    DOTA_Tooltip_ability_special_bonus_unique_ancient_apparition_6:
      "+{s:bonus_damage}% Death Rime Slow/Damage",
  });
  const expected = {
    special_bonus_unique_silencer_arcane_curse_duration:
      "+2s/+1s Arcane Curse Base/Penalty Duration",
    special_bonus_unique_clinkz_9: "-10s Death Pact Charge Restore Time",
    special_bonus_unique_ancient_apparition_6: "+50% Death Rime Slow/Damage",
  };
  const abilities = Object.fromEntries(
    Object.keys(expected).map((name) => [
      name,
      { dname: tokens[`dota_tooltip_ability_${name}`] },
    ]),
  );
  resolveSpecialBonusPlaceholders(abilities, buildSpecialBonusLookup(scripts));
  for (const [name, label] of Object.entries(expected))
    assert.equal(abilities[name].dname, label);
});

test("formats repeated placeholders, sequences and signed operands", () => {
  const abilities = {
    special_bonus_slow: { dname: "{S:BONUS_SLOW}/{s:bonus_slow}" },
    special_bonus_levels: { dname: "+{s:bonus_damage}% damage" },
    special_bonus_interval: {
      dname: "{s:value}s interval change; -{s:value}s",
    },
  };
  const lookup = buildSpecialBonusLookup({
    spell: {
      AbilityValues: {
        slow: { special_bonus_slow: "+-10" },
        damage: { special_bonus_levels: "+10% +20%" },
      },
    },
    special_bonus_interval: { AbilityValues: { value: "-0.1" } },
  });
  resolveSpecialBonusPlaceholders(abilities, lookup);
  assert.equal(abilities.special_bonus_slow.dname, "-10/-10");
  assert.equal(abilities.special_bonus_levels.dname, "+10 / 20% damage");
  assert.equal(
    abilities.special_bonus_interval.dname,
    "-0.1s interval change; -0.1s",
  );
});

test("preserves raw signs and sequences when filling a skill's own attributes", () => {
  const abilities = { spell: { dname: "+{s:value}; {S:VALUE}" } };
  resolveSpecialBonusPlaceholders(
    abilities,
    { spell: { value: "-0.1 0.2" } },
    false,
  );
  assert.equal(abilities.spell.dname, "+-0.1 0.2; -0.1 0.2");
});

test("uses AbilitySpecial before AbilityValues, matching the generator", () => {
  const lookup = buildSpecialBonusLookup({
    spell: {
      AbilitySpecial: {
        "01": {
          var_type: "FIELD_INTEGER",
          damage: { special_bonus_damage: "+10" },
        },
      },
      AbilityValues: { damage: { special_bonus_damage: "+20" } },
    },
    special_bonus_own: {
      AbilitySpecial: { "01": { var_type: "FIELD_FLOAT", value: "-0.1" } },
      AbilityValues: { value: "0.2" },
    },
  });
  assert.equal(lookup.special_bonus_damage.bonus_damage, "10");
  assert.equal(lookup.special_bonus_own.value, "-0.1");
});

test("keeps linked values consistent across repeated mixed-case percent placeholders", () => {
  const scripts = {
    linkedAbility: {
      AbilityValues: { damage: { special_bonus_linked: "+10%" } },
    },
    otherAbility: {
      AbilityValues: { damage: { special_bonus_linked: "+20%" } },
    },
  };
  const abilities = {
    special_bonus_linked: { dname: "+{s:bonus_damage}% / +{S:BONUS_DAMAGE}%" },
  };
  resolveSpecialBonusPlaceholders(
    abilities,
    buildSpecialBonusLookup({
      linkedAbility: scripts.linkedAbility,
    }),
  );
  resolveSpecialBonusPlaceholders(abilities, buildSpecialBonusLookup(scripts));
  assert.equal(abilities.special_bonus_linked.dname, "+10% / +10%");
});
