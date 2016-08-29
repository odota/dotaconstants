var request = require('request');
var async = require('async');
var fs = require('fs');
var manifest = {};
var urls = {
    "items": "http://www.dota2.com/jsfeed/itemdata?l=english",
    "abilities": "http://www.dota2.com/jsfeed/abilitydata?l=english",
    "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
    "heropediadata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
    "heroes": "https://yasp.co/api/heroes",
    //"leagues": "https://yasp.co/api/leagues",
    "regions": "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
    "npc_abilities": "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json",
    "countries": "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
};
async.each(Object.keys(urls), function (key, cb)
{
    var val = urls[key];
    //grab raw data from each url and save
    console.error(val);
    request(val, function (err, resp, body)
    {
        if (err || resp.statusCode !== 200)
        {
            return cb(err);
        }
        fs.writeFileSync('./json/' + key + ".json", JSON.stringify(JSON.parse(body), null, 2));
        cb(err);
    });
}, function (err)
{
    if (err)
    {
        throw err;
    }
    var cfs = fs.readdirSync(__dirname + '/../json');
    cfs.forEach(function (f)
    {
        manifest[f.split(".")[0]] = 1;
    });
    fs.writeFileSync('./manifest.json', JSON.stringify(manifest, null, 2));
    process.exit(0);
});
