const request = require('request');
const async = require('async');
const fs = require('fs');
const sources = [{
  key: "items",
  url: "http://www.dota2.com/jsfeed/itemdata?l=english",
  transform: respObj => {
    const items = respObj.itemdata;
    for (const key in items) {
      items[key].img = "/apps/dota2/images/items/" + items[key].img;
    }
    return items;
  },
}, {
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
    for (var key in items) {
      if (items[key].components) {
        var arr = expandItemGroup(key, items);
        var obj = {};
        arr.forEach(function (e) {
          obj[e] = 1;
        });
        itemGroups.push(obj);
      }
    }
    return itemGroups;
  },
}, {
  key: "abilities",
  url: "http://www.dota2.com/jsfeed/abilitydata?l=english",
  transform: respObj => {
    const abilities = respObj.abilitydata;
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
    for (var key2 in abilities) {
      abilities[key2].img = "/apps/dota2/images/abilities/" + key2 + "_md.png";
      abilities[key2].cmb = abilities[key2].cmb.replace("http://cdn.dota2.com", "");
    }
    return abilities;
  },
}, {
  key: "ability_ids",
  url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json",
  transform: respObj => {
    const ability_ids = {};
    for (var key2 in respObj.DOTAAbilities) {
      const block = respObj.DOTAAbilities[key2];
      if (block && block.ID) {
        ability_ids[block.ID] = key2;
      }
    }
    return ability_ids;
  },
}, {
  key: "heroes",
  url: "https://api.opendota.com/api/heroes",
  transform: respObj => {
    const heroes = {};
    respObj.forEach(function (h) {
      h.img = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_full.png";
      heroes[h.id] = h;
    });
    return heroes;
  },
}, {
  key: "hero_names",
  url: "https://api.opendota.com/api/heroes",
  transform: respObj => {
    const heroNames = {};
    respObj.forEach(function (h) {
      h.img = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_full.png";
      heroNames[h.name] = h;
    });
    return heroNames;
  },
}, {
  key: "region",
  url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
  transform: respObj => {
    var region = {};
    var regions = respObj.regions;
    for (var key in regions) {
      region[regions[key].region] = regions[key].display_name.slice("#dota_region_".length).split("_").map(s => s.toUpperCase()).join(" ");
    }
    return region;
  },
}, {
  key: "cluster",
  url: "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
  transform: respObj => {
    var cluster = {};
    var regions = respObj.regions;
    for (var key in regions) {
      if (regions[key].clusters) {
        regions[key].clusters.forEach(function (c) {
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
}, ];
// "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
// "heropediadata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
// "leagues": "https://api.opendota.com/api/leagues",
async.each(sources, function (s, cb) {
    const url = s.url;
    //grab raw data from each url and save
    console.error(url);
    request(url, function (err, resp, body) {
      if (err || resp.statusCode !== 200) {
        return cb(err);
      }
      body = JSON.parse(body);
      if (s.transform) {
        body = s.transform(body);
      }
      fs.writeFileSync('./json/' + s.key + ".json", JSON.stringify(body, null, 2));
      cb(err);
    });
  },
  function (err) {
    if (err) {
      throw err;
    }
    const cfs = fs.readdirSync(__dirname + '/../json');
    const exports = cfs.map((filename) => `export const ${filename.split('.')[0]} = require(__dirname + '/json/${filename.split('.')[0]}.json');`);
    fs.writeFileSync('./index.js', exports.join('\n'));
    process.exit(0);
  });

function expandItemGroup(key, items) {
  var base = [key];
  if (items[key] && items[key].components) {
    return [].concat.apply(base, items[key].components.map(function (c) {
      return expandItemGroup(c, items);
    }));
  } else {
    return base;
  }
}