const request = require('request');
const async = require('async');
const fs = require('fs');
const sources = [
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
    url: ['http://www.dota2.com/jsfeed/abilitydata?l=english', 'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_english.json'],
    transform: respObj => {
      const abilities = respObj[0].abilitydata;
      const strings = respObj[1].lang.Tokens;
      // Add missing Shadow Fiend raze abilities by copying the shortest raze
      if (!abilities.nevermore_shadowraze2) {
        abilities.nevermore_shadowraze2 = Object.assign({}, abilities.nevermore_shadowraze1);
        // Find and replace short raze range with medium raze range
        abilities.nevermore_shadowraze2.attrib = abilities.nevermore_shadowraze2.attrib.replace(/\d{3}/, 450);
      }
      if (!abilities.nevermore_shadowraze3) {
        abilities.nevermore_shadowraze3 = Object.assign({}, abilities.nevermore_shadowraze1);
        // Find and replace short raze range with long raze range
        abilities.nevermore_shadowraze3.attrib = abilities.nevermore_shadowraze3.attrib.replace(/\d{3}/, 700);
      }
      // Add missing Keeper of the Light missing ability
      if (!abilities.keeper_of_the_light_spirit_form_illuminate_end) {
        abilities.keeper_of_the_light_spirit_form_illuminate_end = Object.assign({}, abilities.keeper_of_the_light_illuminate_end);
      }
      Object.keys(abilities).forEach(key => {
        abilities[key].img = "/apps/dota2/images/abilities/" + key + "_md.png";
        if (abilities[key].cmb) {
          abilities[key].cmb = replaceUselessDecimals(abilities[key].cmb);
        }
      });
      // Add talents
      Object.keys(strings).forEach(key => {
        if (key.indexOf('DOTA_Tooltip_Ability_special') === 0 || key === 'DOTA_Tooltip_ability_attribute_bonus') {
          abilities[key.substring('DOTA_Tooltip_Ability_'.length)] = {
            dname: strings[key],
          };
        }
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
        h.img = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_full.png";
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
        h.img = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_full.png";
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
        region[regions[key].region] = regions[key].display_name.slice("#dota_region_".length).split("_").map(s => s.toUpperCase()).join(" ");
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
        fs.writeFileSync('./json/' + s.key + ".json", JSON.stringify(body, null, 2));
        cb(err);
      }
    },
    function(err) {
      if (err) {
        throw err;
      }
      const cfs = fs.readdirSync(__dirname + '/../json');
      // Exports aren't supported in Node yet, so use old export syntax for now
      // const code = cfs.map((filename) => `export const ${filename.split('.')[0]} = require(__dirname + '/json/${filename.split('.')[0]}.json');`).join('\n';
      const code = `module.exports = {
${cfs.map((filename) => `${filename.split('.')[0]}: require(__dirname + '/json/${filename.split('.')[0]}.json')`).join(',\n')}
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
