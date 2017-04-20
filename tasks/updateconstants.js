const request = require('request');
const async = require('async');
const fs = require('fs');
const sources = [
  // As of 2017-01-25 seems like all the numeric values are missing from the descriptions
  /*
  {
    key: "items",
    url: "http://www.dota2.com/jsfeed/itemdata?l=english",
    transform: respObj => {
      const items = respObj.itemdata;
      for (const key in items) {
        items[key].img = "/apps/dota2/images/items/" + items[key].img;
      }
      return items;
    },
  },
  */
  {
    key: "item_ids",
    url: "http://www.dota2.com/jsfeed/itemdata?l=english",
    transform: respObj => {
      const items = respObj.itemdata;
      const itemIds = {};
      for (const key in items) {
        itemIds[items[key].id] = key;
      }
      return itemIds;
    },
  }, {
    key: "item_groups",
    url: "http://www.dota2.com/jsfeed/itemdata?l=english",
    transform: respObj => {
      const items = respObj.itemdata;
      const itemGroups = [];
      for (const key in items) {
        if (items[key].components) {
          const arr = expandItemGroup(key, items);
          const obj = {};
          arr.forEach(function(e) {
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
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_english.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json'
    ],
    transform: respObj => {
      const strings = respObj[0].lang.Tokens;
      const scripts = respObj[1].DOTAAbilities;

      var not_abilities = [ "Version", "ability_base", "default_attack", "attribute_bonus", "ability_deward" ];

      var abilities = {};

      Object.keys(scripts).filter(key => !not_abilities.includes(key)).forEach(key => {
        var ability = {};

        ability.dname = strings[`DOTA_Tooltip_ability_${key}`];
        ability.desc = replaceSpecialAttribs(strings[`DOTA_Tooltip_ability_${key}_Description`], scripts[key].AbilitySpecial);
        ability.dmg = scripts[key].AbilityDamage ? `DAMAGE: <span class=\"attribVal\">${formatValues(scripts[key].AbilityDamage)}</span><br />` : "";

        ability.attrib = (scripts[key].AbilitySpecial || []).map(attr => {
          let attr_key = Object.keys(attr).find(attr_key => `DOTA_Tooltip_ability_${key}_${attr_key}` in strings);
          if (!attr_key){
            return null;
          }
          let header = strings[`DOTA_Tooltip_ability_${key}_${attr_key}`];
          let percent = header[0] === "%";
          if(percent) {
            header = header.substr(1);
          }
          return `${header} <span class=\"attribVal\">${formatValues(attr[attr_key], percent)}</span>`;
        }).filter(a => a).join("\n");

        ability.cmb = "";
        if(scripts[key].AbilityManaCost || scripts[key].AbilityCooldown) {
          let manacost_img = "<img alt=\"Mana Cost\" title=\"Mana Cost\" class=\"manaImg\" src=\"http://cdn.dota2.com/apps/dota2/images/tooltips/mana.png\" width=\"16\" height=\"16\" border=\"0\" />";
          let cooldown_img = "<img alt=\"Cooldown\" title=\"Cooldown\" class=\"cooldownImg\" src=\"http://cdn.dota2.com/apps/dota2/images/tooltips/cooldown.png\" width=\"16\" height=\"16\" border=\"0\" />";
          if(scripts[key].AbilityManaCost) {
            ability.cmb += `<div class="mana">${manacost_img} ${formatValues(scripts[key].AbilityManaCost, false, "/")}</div>`;
          } 
          if(scripts[key].AbilityCooldown) {
            ability.cmb += `<div class="cooldown">${cooldown_img} ${formatValues(scripts[key].AbilityCooldown, false, "/")}</div>`;
          }
          ability.cmb = `<div class="cooldownMana">${ability.cmb}<br clear="left" /></div>`;
        }

        ability.img = `/apps/dota2/images/abilities/${key}_md.png`;
        if (key.indexOf('special_bonus') === 0) {
          ability = { dname: ability.dname };
        }
        abilities[key] = ability;
      });
      return abilities;
    },
  }, {
    key: "ability_keys",
    url: "http://www.dota2.com/jsfeed/abilitydata?l=english",
    transform: respObj => {
      const abilityKeys = {};
      const abilities = respObj.abilitydata;
      for (const key in abilities) {
        abilityKeys[key] = 1;
      }
      return abilityKeys;
    },
  }, {
    key: "ability_ids",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json",
    transform: respObj => {
      const abilityIds = {};
      for (const key in respObj.DOTAAbilities) {
        const block = respObj.DOTAAbilities[key];
        if (block && block.ID) {
          abilityIds[block.ID] = key;
        }
      }
      return abilityIds;
    },
  }, {
    key: "heroes",
    url: "https://api.opendota.com/api/heroes",
    transform: respObj => {
      const heroes = {};
      respObj.forEach(function(h) {
        h.img = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_full.png?";
        h.icon = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_icon.png";
        heroes[h.id] = h;
      });
      return heroes;
    },
  }, {
    key: "hero_names",
    url: "https://api.opendota.com/api/heroes",
    transform: respObj => {
      const heroNames = {};
      respObj.forEach(function(h) {
        h.img = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_full.png?";
        h.icon = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_icon.png";
        heroNames[h.name] = h;
      });
      return heroNames;
    },
  }, {
    key: "region",
    url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
    transform: respObj => {
      const region = {};
      const regions = respObj.regions;
      for (const key in regions) {
        if (Number(regions[key].region) > 0) {
          region[regions[key].region] = regions[key].display_name.slice("#dota_region_".length).split("_").map(s => s.toUpperCase()).join(" ");
        }
      }
      return region;
    },
  }, {
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
  }, {
    key: "countries",
    url: "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
    transform: respObj => {
      const countries = {};
      respObj.map(c => ({
        name: {
          common: c.name.common
        },
        cca2: c.cca2
      })).forEach(c => {
        countries[c.cca2] = c;
      });
      return countries;
    },
  },
];
// "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
// "heropediadata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
// "leagues": "https://api.opendota.com/api/leagues",
async.each(sources, function(s, cb) {
      const url = s.url;
      //grab raw data from each url and save
      console.log(url);
      if (typeof url === 'object') {
        async.map(url, (urlString, cb) => {
          request(urlString, (err, resp, body) => {
            cb(err, JSON.parse(body));
          });
        }, (err, resultArr) => {
          handleResponse(err, {
            statusCode: 200
          }, JSON.stringify(resultArr));
        });
      }
      else {
        request(url, handleResponse);
      }

      function handleResponse(err, resp, body) {
        if (err || resp.statusCode !== 200) {
          return cb(err);
        }
        body = JSON.parse(body);
        if (s.transform) {
          body = s.transform(body);
        }
        fs.writeFileSync('./build/' + s.key + '.json', JSON.stringify(body, null, 2));
        cb(err);
      }
    },
    function(err) {
      if (err) {
        throw err;
      }
      // Copy manual json files to build
      const jsons = fs.readdirSync('./json');
      jsons.forEach((filename) => {
        fs.writeFileSync('./build/' + filename, fs.readFileSync('./json/' + filename, 'utf-8'));
      });
      // Reference built files in index.js
      const cfs = fs.readdirSync('./build');
      // Exports aren't supported in Node yet, so use old export syntax for now
      // const code = cfs.map((filename) => `export const ${filename.split('.')[0]} = require(__dirname + '/json/${filename.split('.')[0]}.json');`).join('\n';
      const code = `module.exports = {
${cfs.map((filename) => `${filename.split('.')[0]}: require(__dirname + '/build/${filename.split('.')[0]}.json')`).join(',\n')}
};`;
    fs.writeFileSync('./index.js', code);
    process.exit(0);
  });

function expandItemGroup(key, items) {
  let base = [key];
  if (items[key] && items[key].components) {
    return [].concat.apply(base, items[key].components.map(function (c) {
      return expandItemGroup(c, items);
    }));
  } else {
    return base;
  }
}

function replaceUselessDecimals(strToReplace) {
  return strToReplace.replace(/\.0+(\D)/, '$1');
}

// Formats something like "20 21 22" or [ 20, 21, 22 ] to be "20 / 21 / 22"
function formatValues(value, percent=false, separator=" / ") {
  var values = Array.isArray(value) ? value : String(value).split(" ");
  if (values.every(v => v == values[0])) {
    values = [ values[0] ];
  }
  if(percent){
    values = values.map(v => v + "%");
  }
  return values.join(separator).replace(/\.0+(\D|$)/g, '$1');
}

// Formats templates like "Storm's movement speed is %storm_move_speed%" with "Storm's movement speed is 32"
// args are the template, and a list of attribute dictionaries, like the ones in AbilitySpecial for each ability in the npc_abilities.json from the vpk
function replaceSpecialAttribs(template, attribs) {
  if (!template) { 
    return template; 
  }
  if (attribs) {
    template = template.replace(/%([^%]*)%/g, function(str, name) {
      if (name == "") {
        return "%";
      }
      var attr = attribs.find(attr => name in attr);
      if (!attr && name[0] === "d") { // Because someone at valve messed up in 4 places
        name = name.substr(1);
        attr = attribs.find(attr => name in attr);
      } 
      if (!attr) {
        console.log(`cant find attribute %${name}%`);
        return `%${name}%`;
      }
      return attr[name];
    });
  }
  template = template.replace(/\\n/g, "\r\n");
  return template;
}
