const request = require("request");
const async = require("async");
const fs = require("fs");
const simplevdf = require("simple-vdf");
const { mapAbilities } = require("../utils");

const extraStrings = {
  DOTA_ABILITY_BEHAVIOR_NONE: "None",
  DOTA_ABILITY_BEHAVIOR_PASSIVE: "Passive",
  DOTA_ABILITY_BEHAVIOR_UNIT_TARGET: "Unit Target",
  DOTA_ABILITY_BEHAVIOR_CHANNELLED: "Channeled",
  DOTA_ABILITY_BEHAVIOR_POINT: "Point Target",
  DOTA_ABILITY_BEHAVIOR_ROOT_DISABLES: "Root",
  DOTA_ABILITY_BEHAVIOR_AOE: "AOE",
  DOTA_ABILITY_BEHAVIOR_NO_TARGET: "No Target",
  DOTA_ABILITY_BEHAVIOR_AUTOCAST: "Autocast",
  DOTA_ABILITY_BEHAVIOR_ATTACK: "Attack Modifier",
  DOTA_ABILITY_BEHAVIOR_IMMEDIATE: "Instant Cast",
  DAMAGE_TYPE_PHYSICAL: "Physical",
  DAMAGE_TYPE_MAGICAL: "Magical",
  DAMAGE_TYPE_PURE: "Pure",
  SPELL_IMMUNITY_ENEMIES_YES: "Yes",
  SPELL_IMMUNITY_ENEMIES_NO: "No",
  DOTA_ABILITY_BEHAVIOR_HIDDEN: "Hidden",
};

const ignoreStrings = [
  "DOTA_ABILITY_BEHAVIOR_ROOT_DISABLES",
  "DOTA_ABILITY_BEHAVIOR_DONT_RESUME_ATTACK",
  "DOTA_ABILITY_BEHAVIOR_DONT_RESUME_MOVEMENT",
  "DOTA_ABILITY_BEHAVIOR_IGNORE_BACKSWING",
  "DOTA_ABILITY_BEHAVIOR_TOGGLE",
  "DOTA_ABILITY_BEHAVIOR_IGNORE_PSEUDO_QUEUE",
];

const badNames = [
  "Version",
  "npc_dota_hero_base",
  "npc_dota_hero_target_dummy",
];

const extraAttribKeys = [
  "AbilityCastRange",
  "AbilityChargeRestoreTime", 
  "AbilityDuration",
  "AbilityChannelTime",
  "AbilityCastPoint",
  "AbilityCharges"
];

const now = Number(new Date());

const sources = [
  {
    key: "items",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/items.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/neutral_items.txt",
    ],
    transform: (respObj) => {
      const strings = mapAbilities(respObj[0].lang.Tokens);
      const scripts = respObj[1].DOTAAbilities;
      const neutrals = respObj[2];
      // parse neutral items into name => tier map
      const neutralItemNameTierMap = getNeutralItemNameTierMap(neutrals);

      // Fix places where valve doesnt care about correct case
      Object.keys(strings).forEach((key) => {
        if (key.includes("DOTA_Tooltip_Ability_")) {
          strings[
            key.replace("DOTA_Tooltip_Ability_", "DOTA_Tooltip_ability_")
          ] = strings[key];
        }
      });

      var items = {};

      Object.keys(scripts)
        .filter((key) => {
          return (
            !(key.includes("item_recipe") && scripts[key].ItemCost === "0") &&
            key !== "Version"
          );
        })
        .forEach((key) => {
          var item = {
            ...replaceSpecialAttribs(
              strings[`DOTA_Tooltip_ability_${key}_Description`],
              scripts[key].AbilitySpecial,
              true,
              scripts[key]
            ),
          };

          item.id = parseInt(scripts[key].ID);
          item.img = `/apps/dota2/images/items/${key.replace(
            /^item_/,
            ""
          )}_lg.png?t=${1593393829403}`;
          if (key.includes("item_recipe")) {
            item.img = `/apps/dota2/images/items/recipe_lg.png?t=${now}`;
          }

          item.dname = strings[`DOTA_Tooltip_ability_${key}`];
          item.qual = scripts[key].ItemQuality;
          item.cost = parseInt(scripts[key].ItemCost);

          var notes = [];
          for (
            let i = 0;
            strings[`DOTA_Tooltip_ability_${key}_Note${i}`];
            i++
          ) {
            notes.push(strings[`DOTA_Tooltip_ability_${key}_Note${i}`]);
          }

          item.notes = notes.join("\n");

          item.attrib = formatAttrib(
            scripts[key].AbilitySpecial,
            strings,
            `DOTA_Tooltip_ability_${key}_`
          ).filter((attr) => !attr.generated || attr.key === "lifetime");

          item.mc = parseInt(scripts[key].AbilityManaCost) || false;
          item.cd = parseInt(scripts[key].AbilityCooldown) || false;

          item.lore = (
            strings[`DOTA_Tooltip_ability_${key}_Lore`] || ""
          ).replace(/\\n/g, "\r\n");

          item.components = null;
          item.created = false;
          item.charges = parseInt(scripts[key].ItemInitialCharges) || false;
          if (neutralItemNameTierMap[key]) {
            item.tier = neutralItemNameTierMap[key];
          }
          items[key.replace(/^item_/, "")] = item;
        });

      // Load recipes
      Object.keys(scripts)
        .filter(
          (key) => scripts[key].ItemRequirements && scripts[key].ItemResult
        )
        .forEach((key) => {
          result_key = scripts[key].ItemResult.replace(/^item_/, "");
          items[result_key].components = scripts[key].ItemRequirements[0]
            .split(";")
            .map((item) => item.replace(/^item_/, ""));
          items[result_key].created = true;
        });

      //Manually Adding DiffBlade2 for match data prior to 7.07
      items["diffusal_blade_2"] = {
        id: 196,
        img: "/apps/dota2/images/items/diffusal_blade_2_lg.png?3",
        dname: "Diffusal Blade",
        qual: "artifact",
        cost: 3850,
        desc:
          "Active: Purge Targets an enemy, removing buffs from the target and slowing it for 4 seconds.Range: 600\nPassive: ManabreakEach attack burns 50 mana from the target, and deals 0.8 physical damage per burned mana. Burns 16 mana per attack from melee illusions and 8 mana per attack from ranged illusions. Dispel Type: Basic Dispel",
        notes: "Does not stack with other manabreak abilities.",
        attrib: [
          {
            key: "bonus_agility",
            header: "",
            value: ["25", "35"],
            footer: "Agility",
          },
          {
            key: "bonus_intellect",
            header: "",
            value: ["10", "15"],
            footer: "Intelligence",
          },
          {
            key: "initial_charges",
            header: "INITIAL CHARGES:",
            value: "8",
            generated: true,
          },
          {
            key: "feedback_mana_burn",
            header: "FEEDBACK MANA BURN:",
            value: "50",
            generated: true,
          },
          {
            key: "feedback_mana_burn_illusion_melee",
            header: "FEEDBACK MANA BURN ILLUSION MELEE:",
            value: "16",
            generated: true,
          },
          {
            key: "feedback_mana_burn_illusion_ranged",
            header: "FEEDBACK MANA BURN ILLUSION RANGED:",
            value: "8",
            generated: true,
          },
          {
            key: "purge_summoned_damage",
            header: "PURGE SUMMONED DAMAGE:",
            value: "99999",
            generated: true,
          },
          {
            key: "purge_rate",
            header: "PURGE RATE:",
            value: "5",
            generated: true,
          },
          {
            key: "purge_root_duration",
            header: "PURGE ROOT DURATION:",
            value: "3",
            generated: true,
          },
          {
            key: "purge_slow_duration",
            header: "PURGE SLOW DURATION:",
            value: "4",
            generated: true,
          },
          {
            key: "damage_per_burn",
            header: "DAMAGE PER BURN:",
            value: "0.8",
            generated: true,
          },
          {
            key: "cast_range_tooltip",
            header: "CAST RANGE TOOLTIP:",
            value: "600",
            generated: true,
          },
        ],
        mc: false,
        cd: 4,
        lore:
          "An enchanted blade that allows the user to cut straight into the enemy's soul.",
        components: ["diffusal_blade", "recipe_diffusal_blade"],
        created: true,
      };

      //Manually added for match data prior to 7.07
      items["recipe_iron_talon"] = {
        id: 238,
        img: "/apps/dota2/images/items/recipe_lg.png?3",
        dname: "Iron Talon Recipe",
        cost: 125,
        desc: "",
        notes: "",
        attrib: [],
        mc: false,
        cd: false,
        lore: "",
        components: null,
        created: false,
      };

      return items;
    },
  },
  {
    key: "item_ids",
    url:
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/items.json",
    transform: (respObj) => {
      const items = respObj.DOTAAbilities;
      const itemIds = {};
      for (const key in items) {
        const item = items[key];
        if (typeof item === "object" && "ID" in item) {
          itemIds[item.ID] = key.replace("item_", "");
        }
      }
      //manually adding DiffBlade2
      itemIds[196] = "diffusal_blade_2";

      return itemIds;
    },
  },
  {
    key: "item_groups",
    url: "http://www.dota2.com/jsfeed/itemdata?l=english",
    transform: (respObj) => {
      const items = respObj.itemdata;
      const itemGroups = [];
      for (const key in items) {
        if (items[key].components) {
          const arr = expandItemGroup(key, items);
          const obj = {};
          arr.forEach(function (e) {
            obj[e] = 1;
          });
          itemGroups.push(obj);
        }
      }
      return itemGroups;
    },
  },
  {
    key: "abilities",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json",
    ],
    transform: (respObj) => {
      const strings = respObj[0].lang.Tokens;
      const scripts = respObj[1].DOTAAbilities;

      var not_abilities = [
        "Version",
        "ability_base",
        "default_attack",
        "attribute_bonus",
        "ability_deward",
      ];

      var abilities = {};

      Object.keys(scripts)
        .filter((key) => !not_abilities.includes(key))
        .forEach((key) => {
          var ability = {};

          ability.dname = replaceSValues(
            strings[`DOTA_Tooltip_ability_${key}`],
            scripts[key].AbilitySpecial
          );

          ability.behavior =
            formatBehavior(scripts[key].AbilityBehavior) || undefined;
          ability.dmg_type =
            formatBehavior(scripts[key].AbilityUnitDamageType) || undefined;
          ability.bkbpierce =
            formatBehavior(scripts[key].SpellImmunityType) || undefined;
          ability.target_type =
            formatBehavior(scripts[key].AbilityUnitTargetTeam) || undefined;

          ability.desc = replaceSpecialAttribs(
            strings[`DOTA_Tooltip_ability_${key}_Description`],
            scripts[key].AbilitySpecial,
            false,
            scripts[key]
          );
          ability.dmg =
            scripts[key].AbilityDamage &&
            formatValues(scripts[key].AbilityDamage);

          ability.attrib = formatAttrib(
            scripts[key].AbilitySpecial,
            strings,
            `DOTA_Tooltip_ability_${key}_`
          );

          if (scripts[key].AbilityManaCost || scripts[key].AbilityCooldown) {
            if (scripts[key].AbilityManaCost) {
              ability.mc = formatValues(
                scripts[key].AbilityManaCost,
                false,
                "/"
              );
            }
            if (scripts[key].AbilityCooldown) {
              ability.cd = formatValues(
                scripts[key].AbilityCooldown,
                false,
                "/"
              );
            }
          }

          ability.img = `/apps/dota2/images/abilities/${key}_md.png`;
          if (key.indexOf("special_bonus") === 0) {
            ability = { dname: ability.dname };
          }
          abilities[key] = ability;
        });
      return abilities;
    },
  },
  {
    key: "ability_keys",
    url: "http://www.dota2.com/jsfeed/abilitydata?l=english",
    transform: (respObj) => {
      const abilityKeys = {};
      const abilities = respObj.abilitydata;
      for (const key in abilities) {
        abilityKeys[key] = 1;
      }
      return abilityKeys;
    },
  },
  {
    key: "ability_ids",
    url:
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json",
    transform: (respObj) => {
      const abilityIds = {};
      for (const key in respObj.DOTAAbilities) {
        const block = respObj.DOTAAbilities[key];
        if (block && block.ID) {
          abilityIds[block.ID] = key;
        }
      }
      return abilityIds;
    },
  },
  {
    key: "heroes",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json",
      // "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
    ],
    transform: (respObj) => {
      let heroes = [];
      let keys = Object.keys(respObj[1].DOTAHeroes).filter(
        (name) => !badNames.includes(name)
      );
      keys.forEach((name) => {
        let h = formatVpkHero(name, respObj[1], respObj[0].lang.Tokens[name]);
        h.localized_name =
          h.localized_name ||
          respObj[1]["DOTAHeroes"][name].workshop_guide_name;
        // h.localized_name = h.localized_name || respObj[2].lang.Tokens[name];
        heroes.push(h);
      });
      heroes = heroes.sort((a, b) => a.id - b.id);
      let heroesObj = {};
      for (hero of heroes) {
        hero.id = Number(hero.id);
        heroesObj[hero.id] = hero;
      }
      return heroesObj;
    },
  },
  {
    key: "hero_names",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json",
      // "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
    ],
    transform: (respObj) => {
      let heroes = [];
      let keys = Object.keys(respObj[1].DOTAHeroes).filter(
        (name) => !badNames.includes(name)
      );
      keys.forEach((name) => {
        let h = formatVpkHero(name, respObj[1], respObj[0].lang.Tokens[name]);
        h.localized_name =
          h.localized_name ||
          respObj[1]["DOTAHeroes"][name].workshop_guide_name;
        // h.localized_name = h.localized_name || respObj[2].lang.Tokens[name];
        heroes.push(h);
      });
      heroes = heroes.sort((a, b) => a.id - b.id);
      let heroesObj = {};
      for (hero of heroes) {
        hero.id = Number(hero.id);
        heroesObj[hero.name] = hero;
      }
      return heroesObj;
    },
  },
  {
    key: "hero_abilities",
    url:
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json",
    transform: (respObj) => {
      var DOTAHeroes = respObj.DOTAHeroes;
      const heroAbilities = {};
      Object.keys(DOTAHeroes).forEach(function (heroKey) {
        if (
          heroKey != "Version" &&
          heroKey != "npc_dota_hero_base" &&
          heroKey != "npc_dota_hero_target_dummy"
        ) {
          const newHero = { abilities: [], talents: [] };
          let talentCounter = 2;
          Object.keys(DOTAHeroes[heroKey]).forEach(function (key) {
            var abilityRegexMatch = key.match(/Ability([0-9]+)/);
            if (abilityRegexMatch) {
              var abilityNum = parseInt(abilityRegexMatch[1]);
              if (abilityNum < 10) {
                newHero["abilities"].push(DOTAHeroes[heroKey][key]);
              } else {
                // -8 not -10 because going from 0-based index -> 1 and flooring divison result
                newHero["talents"].push({
                  name: DOTAHeroes[heroKey][key],
                  level: Math.floor(talentCounter / 2),
                });
                talentCounter++;
              }
            }
          });
          heroAbilities[heroKey] = newHero;
        }
      });
      return heroAbilities;
    },
  },
  {
    key: "region",
    url:
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
    transform: (respObj) => {
      const region = {};
      const regions = respObj.regions;
      for (const key in regions) {
        if (Number(regions[key].region) > 0) {
          region[regions[key].region] = regions[key].display_name
            .slice("#dota_region_".length)
            .split("_")
            .map((s) => s.toUpperCase())
            .join(" ");
        }
      }
      return region;
    },
  },
  /* {
     key: "cluster",
     url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
     transform: respObj => {
       const cluster = {};
       const regions = respObj.regions;
       for (const key in regions) {
         if (regions[key].clusters) {
           regions[key].clusters.forEach(function(c) {
             cluster[c] = Number(regions[key].region);
           });
         }
       }
       cluster["121"] = Number(regions['USEast'].region);
       return cluster;
     },
   }, */
  {
    key: "countries",
    url:
      "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
    transform: (respObj) => {
      const countries = {};
      respObj
        .map((c) => ({
          name: {
            common: c.name.common,
          },
          cca2: c.cca2,
        }))
        .forEach((c) => {
          countries[c.cca2] = c;
        });
      return countries;
    },
  },
  {
    key: "chat_wheel",
    url: [
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/chat_wheel.txt",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/hero_chat_wheel_english.txt",
    ],
    transform: (respObj) => {
      const chat_wheel = respObj[0];
      const lang = respObj[1].lang.Tokens;
      const chat_wheel_lang = respObj[2];

      const result = {};

      function localize(input) {
        if (!/^#/.test(input)) {
          return input;
        }
        var key = input.replace(/^#/, "");
        return lang[key] || chat_wheel_lang[key] || key;
      }

      function addMessage(key, message) {
        var data = {
          id: parseInt(message.message_id),
          name: key,
          all_chat: message.all_chat == "1" ? true : undefined,
          label: localize(message.label),
          message: localize(message.message),
          image: message.image,
          badge_tier: message.unlock_hero_badge_tier,
        };
        if (message.sound) {
          if (/^soundboard\./.test(message.sound) || /^wisp_/.test(key)) {
            // All of the soundboard clips and the IO responses are wav files
            data.sound_ext = "wav";
          } else if (message.message_id / 1000 >= 121) {
            // Gets the hero id from the message id
            // If the hero is grimstroke or newer, the files are aac
            data.sound_ext = "aac";
          } else {
            // All other response clips used are mp3s
            data.sound_ext = "mp3";
          }
        }
        result[data.id] = data;
      }

      for (let key in chat_wheel.messages) {
        addMessage(key, chat_wheel.messages[key]);
      }
      for (let hero_id in chat_wheel.hero_messages) {
        for (let key in chat_wheel.hero_messages[hero_id]) {
          addMessage(key, chat_wheel.hero_messages[hero_id][key]);
        }
      }
      return result;
    },
  },
  {
    key: "patchnotes",
    url:
      "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/patchnotes/patchnotes_english.txt",
    transform: (respObj) => {
      let items = Object.keys(require("../build/items.json"));
      let heroes = Object.keys(
        require("../build/hero_names.json")
      ).map((hero) => hero.replace("npc_dota_hero_", ""));

      let result = {};
      let keys = Object.keys(respObj);
      for (let key of keys) {
        let keyArr = key.replace("dota_patch_", "").split("_");
        let patch = keyArr.splice(0, 2).join("_");
        if (!result[patch])
          result[patch] = {
            general: [],
            items: {},
            heroes: {},
          };

        if (keyArr[0].toLowerCase() == "general") {
          result[patch].general.push(respObj[key]);
        } else if (keyArr[0] == "item") {
          let searchName = keyArr.slice(1);
          let itemName = parseNameFromArray(searchName, items);
          if (itemName) {
            if (!result[patch].items[itemName])
              result[patch].items[itemName] = [];
            result[patch].items[itemName].push(respObj[key]);
          } else {
            if (!result[patch].items.misc) result[patch].items.misc = [];
            result[patch].items.misc.push(respObj[key]);
          }
        } else {
          let heroName = parseNameFromArray(keyArr, heroes);
          if (heroName) {
            if (!result[patch].heroes[heroName])
              result[patch].heroes[heroName] = [];
            result[patch].heroes[heroName].push(respObj[key]);
          } else {
            if (!result[patch].heroes.misc) result[patch].heroes.misc = [];
            result[patch].heroes.misc.push(respObj[key]);
          }
        }
      }

      return result;
    },
  },
];

const patches = JSON.parse(fs.readFileSync("./json/patch.json"));
const newPatches = [];
const lastPatch = patches[patches.length - 1];
const today = new Date();
const dayDifference = Math.ceil(
  Math.abs(today.getTime() - new Date(lastPatch.date).getTime()) /
    (1000 * 3600 * 24)
);
patches.forEach((p, i) => {
  newPatches.push({ ...p, id: i });
});
/*
if (dayDifference > 14) {
  const n = Math.floor(dayDifference / 14)
  for (let i = 0; i < n; i += 1) {
    const versionNum = parseFloat(patches[patches.length - 1].name, 10) + 0.01
    const date = new Date(patches[patches.length - 1].date)
    patches.push({ id: i, name: versionNum.toFixed(2), date: new Date(date.getTime() + 60 * 60 * 24 * 1000 * 14) })
  }
}
*/
fs.writeFileSync("./json/patch.json", JSON.stringify(newPatches, null, 1));

// "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
// "heropediadata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
// "leagues": "https://api.opendota.com/api/leagues",
async.each(
  sources,
  function (s, cb) {
    const url = s.url;
    //grab raw data from each url and save
    console.log(url);
    if (typeof url === "object") {
      async.map(
        url,
        (urlString, cb) => {
          request(urlString, (err, resp, body) => {
            cb(err, parseJson(body));
          });
        },
        (err, resultArr) => {
          handleResponse(
            err,
            {
              statusCode: 200,
            },
            JSON.stringify(resultArr)
          );
        }
      );
    } else {
      request(url, handleResponse);
    }

    function parseJson(text) {
      try {
        return JSON.parse(text);
      } catch (err) {
        let vdf = simplevdf.parse(text);
        vdf = vdf[Object.keys(vdf)[0]];
        let keys = Object.keys(vdf);
        let normalized = {};
        for (let key of keys) {
          normalized[key.toLowerCase()] = vdf[key];
        }
        return normalized;
      }
    }

    function handleResponse(err, resp, body) {
      if (err || resp.statusCode !== 200) {
        return cb(err);
      }
      let parsed;
      body = parseJson(body);
      if (s.transform) {
        body = s.transform(body);
      }
      fs.writeFileSync(
        "./build/" + s.key + ".json",
        JSON.stringify(body, null, 2)
      );
      cb(err);
    }
  },
  function (err) {
    if (err) {
      throw err;
    }
    // Copy manual json files to build
    const jsons = fs.readdirSync("./json");
    jsons.forEach((filename) => {
      fs.writeFileSync(
        "./build/" + filename,
        fs.readFileSync("./json/" + filename, "utf-8")
      );
    });
    // Reference built files in index.js
    const cfs = fs.readdirSync("./build");
    // Exports aren't supported in Node yet, so use old export syntax for now
    // const code = cfs.map((filename) => `export const ${filename.split('.')[0]} = require(__dirname + '/json/${filename.split('.')[0]}.json');`).join('\n';
    const code = `module.exports = {
${cfs
  .map(
    (filename) =>
      `${filename.split(".")[0]}: require(__dirname + '/build/${
        filename.split(".")[0]
      }.json')`
  )
  .join(",\n")}
};`;
    fs.writeFileSync("./index.js", code);
    process.exit(0);
  }
);

function expandItemGroup(key, items) {
  let base = [key];
  if (items[key] && items[key].components) {
    return [].concat.apply(
      base,
      items[key].components.map(function (c) {
        return expandItemGroup(c, items);
      })
    );
  } else {
    return base;
  }
}

function replaceUselessDecimals(strToReplace) {
  return strToReplace.replace(/\.0+(\D)/, "$1");
}

// Formats something like "20 21 22" or [ 20, 21, 22 ] to be "20 / 21 / 22"
function formatValues(value, percent = false, separator = " / ") {
  var values = Array.isArray(value) ? value : String(value).split(" ");
  if (values.every((v) => v == values[0])) {
    values = [values[0]];
  }
  if (percent) {
    values = values.map((v) => v + "%");
  }
  let len = values.length;
  let res = values.join(separator).replace(/\.0+(\D|$)/g, "$1");
  return len > 1 ? res.split(separator) : res;
}

// Formats AbilitySpecial for the attrib value for abilities and items
function formatAttrib(attributes, strings, strings_prefix) {
  if (attributes && !Array.isArray(attributes))
    attributes = Object.values(attributes);
  return (attributes || [])
    .map((attr) => {
      let key = Object.keys(attr).find(
        (key) => `${strings_prefix}${key}` in strings
      );
      if (!key) {
        for (item in attr) {
          key = item;
          break;
        }
        return {
          key: key,
          header: `${key.replace(/_/g, " ").toUpperCase()}:`,
          value: formatValues(attr[key]),
          generated: true,
        };
      }

      let final = { key: key };
      let header = strings[`${strings_prefix}${key}`];
      let match = header.match(/(%)?(\+\$)?(.*)/);
      header = match[3];

      if (match[2]) {
        final.header = "+";
        final.value = formatValues(attr[key], match[1]);
        final.footer = strings[`dota_ability_variable_${header}`];
        if ("dota_ability_variable_attack_range".includes(header))
          final.footer = final.footer.replace(/<[^>]*>/g, "");
      } else {
        final.header = header.replace(/<[^>]*>/g, "");
        final.value = formatValues(attr[key], match[1]);
      }

      return final;
    })
    .filter((a) => a);
}

function catogerizeItemAbilities(abilities) {
  const itemAbilities = {};
  abilities.forEach((ability) => {
    if (!ability.includes("<h1>")) {
      (itemAbilities.hint = itemAbilities.hint || []).push(ability);
    } else {
      ability = ability.replace(/<[^h1>]*>/gi, "");
      const regExp = /<h1>\s*(.*)\s*:\s*(.*)\s*<\/h1>\s*([\s\S]*)/gi;
      try {
        const [_, type, name, desc] = regExp.exec(ability);
        (itemAbilities[type.toLowerCase()] =
          itemAbilities[type.toLowerCase()] || []).push({
          name: name,
          desc: desc,
        });
      } catch (e) {
        console.log(e);
      }
    }
  });
  return itemAbilities;
}

function replaceSValues(template, attribs) {
  let values = {};
  if (template && attribs && Array.isArray(attribs)) {
    attribs.forEach((attrib) => {
      let key = Object.keys(attrib)[0];
      values[key] = attrib[key];
    });
    Object.keys(values).forEach((key) => {
      template = template.replace(`{s:${key}}`, values[key]);
    });
  }
  return template;
}

// Formats templates like "Storm's movement speed is %storm_move_speed%" with "Storm's movement speed is 32"
// args are the template, and a list of attribute dictionaries, like the ones in AbilitySpecial for each ability in the npc_abilities.json from the vpk
function replaceSpecialAttribs(template, attribs, isItem = false, allData={}) {
  if (!template) {
    return template;
  }
  if (attribs) {
    //additional special ability keys being catered
    extraAttribKeys.forEach(abilitykey => {
      if (abilitykey in allData) {
        let value = allData[abilitykey].split(' '); //can have multiple values
        value = value.length === 1 ? Number(value[0]) : value.map(v => Number(v));
        attribs.push({[abilitykey.toLowerCase()]: value});
        //these are also present with another attrib name
        if (abilitykey === "AbilityChargeRestoreTime") { 
          attribs.push({"charge_restore_time": value});
        }
        if (abilitykey === "AbilityCharges") {
          attribs.push({"max_charges": value});
        }
      }
    });

    if (template.includes("%customval_team_tomes_used%")){ //in-game line not required in tooltip
      template = template.replace(/[ a-zA-Z]+: %\w+%/g,"");
    }

    template = template.replace(/%([^% ]*)%/g, function (str, name) {
      if (name == "") {
        return "%";
      }
      if (!Array.isArray(attribs)) attribs = Object.values(attribs);
      var attr = attribs.find((attr) => name in attr);
      if (!attr && name[0] === "d") {
        // Because someone at valve messed up in 4 places
        name = name.substr(1);
        attr = attribs.find((attr) => name in attr);
      }
      if (!attr) {
        if (name === "lifesteal") { //special cases, in terms of template context and dota2 gamepedia
          return attribs.find(obj => "lifesteal_percent" in obj).lifesteal_percent; 
        }
        else if (name === "movement_slow") {
          return attribs.find(obj => "damage_pct" in obj).damage_pct; 
        }

        console.log(`cant find attribute %${name}%`);
        return `%${name}%`;
      }
      return attr[name];
    });
  }
  if (isItem) {
    template = template.replace(/<br>/gi, "\n");
    const abilities = template.split("\\n");
    return catogerizeItemAbilities(abilities);
  }
  template = template.replace(/\\n/g, "\n").replace(/<[^>]*>/g, "");
  return template;
}

function formatBehavior(string) {
  if (!string) return false;

  let split = string
    .split(" | ")
    .map((item) => {
      if (!~ignoreStrings.indexOf(item)) {
        return extraStrings[item];
      } else {
        return null;
      }
    })
    .filter((a) => a !== null);

  if (split.length === 1) {
    return split[0];
  } else {
    return split;
  }
}

function formatVpkHero(key, vpkr, localized_name) {
  let h = {};

  let vpkrh = vpkr.DOTAHeroes[key];
  let baseHero = vpkr.DOTAHeroes.npc_dota_hero_base;

  h.id = vpkrh.HeroID;
  h.name = key;
  h.localized_name = localized_name;

  h.primary_attr = vpkrh.AttributePrimary.replace("DOTA_ATTRIBUTE_", "")
    .slice(0, 3)
    .toLowerCase();
  h.attack_type =
    vpkrh.AttackCapabilities == "DOTA_UNIT_CAP_MELEE_ATTACK"
      ? "Melee"
      : "Ranged";
  h.roles = vpkrh.Role.split(",");

  h.img =
    "/apps/dota2/images/heroes/" +
    key.replace("npc_dota_hero_", "") +
    "_full.png?";
  h.icon =
    "/apps/dota2/images/heroes/" +
    key.replace("npc_dota_hero_", "") +
    "_icon.png";
  h.url = vpkrh.url;

  h.base_health = Number(vpkrh.StatusHealth || baseHero.StatusHealth);
  h.base_health_regen = Number(
    vpkrh.StatusHealthRegen || baseHero.StatusHealthRegen
  );
  h.base_mana = Number(vpkrh.StatusMana || baseHero.StatusMana);
  h.base_mana_regen = Number(vpkrh.StatusManaRegen || baseHero.StatusManaRegen);
  h.base_armor = Number(vpkrh.ArmorPhysical || baseHero.ArmorPhysical);
  h.base_mr = Number(vpkrh.MagicalResistance || baseHero.MagicalResistance);

  h.base_attack_min = Number(vpkrh.AttackDamageMin || baseHero.AttackDamageMin);
  h.base_attack_max = Number(vpkrh.AttackDamageMax || baseHero.AttackDamageMax);

  h.base_str = Number(vpkrh.AttributeBaseStrength);
  h.base_agi = Number(vpkrh.AttributeBaseAgility);
  h.base_int = Number(vpkrh.AttributeBaseIntelligence);

  h.str_gain = Number(vpkrh.AttributeStrengthGain);
  h.agi_gain = Number(vpkrh.AttributeAgilityGain);
  h.int_gain = Number(vpkrh.AttributeIntelligenceGain);

  h.attack_range = Number(vpkrh.AttackRange);
  h.projectile_speed = Number(
    vpkrh.ProjectileSpeed || baseHero.ProjectileSpeed
  );
  h.attack_rate = Number(vpkrh.AttackRate || baseHero.AttackRate);

  h.move_speed = Number(vpkrh.MovementSpeed);
  h.turn_rate = Number(vpkrh.MovementTurnRate);

  h.cm_enabled = vpkrh.CMEnabled === "1" ? true : false;
  h.legs = Number(vpkrh.Legs || baseHero.Legs);

  return h;
}

function parseNameFromArray(array, names) {
  let final = [];
  for (let i = 1; i <= array.length; i++) {
    let name = array.slice(0, i).join("_");
    if (names.includes(name)) {
      final.push(name);
    }
  }
  return final.map((a) => a)[0];
}

const getNeutralItemNameTierMap = (neutrals) => {
  var ret = {};
  Object.keys(neutrals).forEach((tier) => {
    var items = neutrals[tier].items;
    Object.keys(items).forEach((itemName) => {
      ret[itemName] = ret[itemName.replace(/recipe_/gi, "")] = parseInt(tier);
    });
  });
  return ret;
};
