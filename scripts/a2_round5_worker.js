// A2 ROUND 5 — son kalan 7 madde
const fs = require('node:fs');
const path = require('node:path');

const DE_FIXES = {
  820:  { de: "paläo",       tr: "paleo (beslenme şekli)" },
  1100: { de: "häufig",      tr: "sık sık, sıklıkla" },
  1884: { de: "jederzeit",   tr: "her zaman, istediğin zaman" },
};

const DELETE = new Set([
  1500, // "letzten" / "Jahr 9 Tage krank."
  1655, // "wann die Züge abfahren. ob whether, if" / "Können"
  2074, // "also von 08–12 Uhr, besuchen" / "."
  2076, // "also von 08–16 Uhr, besuchen" / "."
]);

const apply = process.argv[2] === 'apply';
const dataPath = path.join(__dirname, '..', 'data', 'a2.json');
const a = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

let deChanges = 0, deleted = 0;
const log = [];

for (const [idx, { de, tr }] of Object.entries(DE_FIXES)) {
  const i = +idx;
  if (!a[i] || DELETE.has(i)) continue;
  if (a[i].de !== de || a[i].tr !== tr) {
    log.push(`DE ${i}  de:${JSON.stringify(a[i].de)} -> ${JSON.stringify(de)} | tr:${JSON.stringify(a[i].tr)} -> ${JSON.stringify(tr)}`);
    a[i].de = de;
    a[i].tr = tr;
    deChanges++;
  }
}

const delIdx = [...DELETE].sort((x,y)=>y-x);
const out = a.slice();
for (const i of delIdx) {
  if (!out[i]) continue;
  log.push(`DEL ${i}  de:${JSON.stringify(out[i].de)} | tr:${JSON.stringify(out[i].tr)}`);
  out.splice(i, 1);
  deleted++;
}

console.log(JSON.stringify({
  before_total: a.length,
  after_total: out.length,
  de_changes: deChanges,
  deleted,
  mode: apply ? 'APPLY' : 'DRY-RUN',
}, null, 2));

if (apply) {
  fs.copyFileSync(dataPath, dataPath + '.bak6');
  fs.writeFileSync(
    dataPath,
    JSON.stringify(out, null, 0).replace(/},{/g, '},\n{') + '\n'
  );
  fs.writeFileSync(path.join(__dirname, 'a2_round5_changes.log'), log.join('\n') + '\n');
  console.log('Yazıldı. Yedek: data/a2.json.bak6');
} else {
  console.log('Dry-run.');
}
