var constants = {};
for (var key in require(__dirname + '/manifest.json'))
{
  constants[key] = require(__dirname + '/json/' + key + ".json");
}
var heroes = constants.heroes;
//key heroes by id
constants.heroes = {};
//key heroes by name
constants.hero_names = {};
heroes.forEach(function (h)
{
  h.img = "/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_full.png";
  constants.heroes[h.id] = h;
  constants.hero_names[h.name] = h;
});
/*
//leagues, key by id
var leagues = JSON.parse(JSON.stringify(constants.leagues.result.leagues));
constants.leagues = {};
leagues.forEach(function(l) {
    l.name = l.name.replace("#DOTA_Item_", "").split("_").join(" ");
    constants.leagues[l.leagueid] = l;
});
*/
//items, already keyed by name
var items = constants.items.itemdata;
constants.item_ids = {};
for (var key in items)
{
  constants.item_ids[items[key].id] = key;
  items[key].img = "/apps/dota2/images/items/" + items[key].img;
}
constants.item_groups = [];
for (var key in items)
{
  if (items[key].components)
  {
    var arr = expandItemGroup(key);
    var obj = {};
    arr.forEach(function (e)
    {
      obj[e] = 1;
    });
    constants.item_groups.push(obj);
  }
}

function expandItemGroup(key)
{
  var base = [key];
  if (items[key] && items[key].components)
  {
    return [].concat.apply(base, items[key].components.map(function (c)
    {
      return expandItemGroup(c);
    }));
  }
  else
  {
    return base;
  }
}
var countries = {};
constants.countries.forEach(function (c)
{
  countries[c.cca2] = c;
});
constants.countries = countries;
//console.log(constants.item_groups);
constants.items = items;
//abilities, already keyed by name
var abilities = constants.abilities.abilitydata;
// Add missing Shadow Fiend raze abilities by copying the shortest raze
if (!abilities.nevermore_shadowraze2)
{
  abilities.nevermore_shadowraze2 = Object.assign(
  {}, abilities.nevermore_shadowraze1);
  // Find and replace short raze range with medium raze range
  abilities.nevermore_shadowraze2.attrib = abilities.nevermore_shadowraze2.attrib.replace(/\d{3}/, 450);
}
if (!abilities.nevermore_shadowraze3)
{
  abilities.nevermore_shadowraze3 = Object.assign(
  {}, abilities.nevermore_shadowraze1);
  // Find and replace short raze range with long raze range
  abilities.nevermore_shadowraze3.attrib = abilities.nevermore_shadowraze3.attrib.replace(/\d{3}/, 700);
}
if (!abilities.beastmaster_call_of_the_wild_boar)
{
  abilities.beastmaster_call_of_the_wild_boar = Object.assign(
  {}, abilities.beastmaster_call_of_the_wild);
  // Find and replace wild hawk with wild boar decription
  abilities.beastmaster_call_of_the_wild_boar.dname = "Call of the Wild: Boar";
  abilities.beastmaster_call_of_the_wild_boar.affects = "ABILITY: <span class=\"attribVal\">No Target</span><br />DAMAGE TYPE: <span class=\"attribVal\"><font color=\"#71a9ea\">Physical</font></span><br />";
  abilities.beastmaster_call_of_the_wild_boar.desc = "Beastmaster calls a powerful Boar to stalk the battlefield, capable of spitting poison at enemies to slow their movement and attack speed.";
  abilities.beastmaster_call_of_the_wild_boar.attrib = "BOAR HEALTH: <span class=\"attribVal\">200 / 300 / 400 / 500</span><br />\nBOAR ATTACK DAMAGE: <span class=\"attribVal\">10 / 25 / 40 / 55</span><br />\nBOAR BOAR MOVEMENT SLOW: <span class=\"attribVal\">10% / 20% / 30% / 40%</span><br />\nBOAR ATTACK SLOW: <span class=\"attribVal\">10 / 20 / 30 / 40</span><br />\nBOAR POISON DURATION: <span class=\"attribVal\">3</span><br />\nBOAR DURATION: <span class=\"attribVal\">60 / 60 / 60 / 60</span>";
}
for (var key2 in abilities)
{
  abilities[key2].img = "/apps/dota2/images/abilities/" + key2 + "_md.png";
  abilities[key2].cmb = abilities[key2].cmb.replace("http://cdn.dota2.com", "");
}
constants.abilities = abilities;
constants.lanes = [];
for (var i = 0; i < 128; i++)
{
  constants.lanes.push([]);
  for (var j = 0; j < 128; j++)
  {
    var lane;
    if (Math.abs(i - (127 - j)) < 8)
    {
      lane = 2; //mid
    }
    else if (j < 27 || i < 27)
    {
      lane = 3; //top
    }
    else if (j >= 100 || i >= 100)
    {
      lane = 1; //bot
    }
    else if (i < 50)
    {
      lane = 5; //djung
    }
    else if (i >= 77)
    {
      lane = 4; //rjung
    }
    else
    {
      lane = 2; //mid
    }
    constants.lanes[i].push(lane);
  }
}
var cluster = {};
var region = {};
//Remove regions nesting
constants.regions = constants.regions.regions;
var regions = constants.regions;
for (var key in regions)
{
  region[regions[key].region] = regions[key].display_name.slice("#dota_region_".length).split("_").map(function (s)
  {
    return s.toUpperCase();
  }).join(" ");
  if (regions[key].clusters)
  {
    regions[key].clusters.forEach(function (c)
    {
      cluster[c] = Number(regions[key].region);
    });
  }
}
cluster["121"] = constants.regions['USEast'].region;
constants.cluster = cluster;
constants.region = region;
constants.anonymous_account_id = 4294967295;
module.exports = constants;
