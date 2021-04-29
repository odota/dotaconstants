const patches = require('../json/patch.json');
const fs = require('fs');

const last = patches.slice(-1)[0];

patches.push({
  name: (Number(last.name) + 0.01).toString().padEnd(4, '0'),
  date: new Date().toISOString(),
  id: last.id + 1,
});


fs.writeFileSync('./json/patch.json', JSON.stringify(patches, null, 2));