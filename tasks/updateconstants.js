const request = require('request');
const async = require('async');
const fs = require('fs');
const manifest = {};
const urls = {
    "items": "http://www.dota2.com/jsfeed/itemdata?l=english",
    "abilities": "http://www.dota2.com/jsfeed/abilitydata?l=english",
    // "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
    // "heropediadata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
    "heroes": "https://api.opendota.com/api/heroes",
    // "leagues": "https://api.opendota.com/api/leagues",
    "regions": "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
    "ability_ids": "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json",
    "countries": "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
};
async.each(Object.keys(urls), function (key, cb) {
    const val = urls[key];
    //grab raw data from each url and save
    console.error(val);
    request(val, function (err, resp, body) {
        if (err || resp.statusCode !== 200) {
            return cb(err);
        }
        let respObj = JSON.parse(body);
        if (key === 'ability_ids') {
            // Reduce npc_abilities
            const ability_ids = {};
            for (var key2 in respObj.DOTAAbilities) {
                const block = respObj.DOTAAbilities[key2];
                if (block && block.ID) {
                    ability_ids[block.ID] = key2;
                }
            }
            respObj = ability_ids;
        }
        else if (key === 'countries') {
            respObj = respObj.map(c => ({name: {common: c.name.common}, cca2: c.cca2}));
        }
        fs.writeFileSync('./json/' + key + ".json", JSON.stringify(respObj, null, 2));
        cb(err);
    });
},
function (err) {
    if (err) {
        throw err;
    }
    const cfs = fs.readdirSync(__dirname + '/../json');
    cfs.forEach(function (f) {
        manifest[f.split(".")[0]] = 1;
    });
    fs.writeFileSync('./manifest.json', JSON.stringify(manifest, null, 2));
    process.exit(0);
});
