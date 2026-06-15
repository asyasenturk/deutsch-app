// A2 ROUND 4 — son saf-İngilizce ve fragment temizliği
const fs = require('node:fs');
const path = require('node:path');

const TR_FIXES = {
  100: "çoğunlukla, genellikle",
  616: "atölye çalışması, workshop",
};

const DELETE = new Set([
  1211, // "einen" / "kalten Winter."
]);

const apply = process.argv[2] === 'apply';
const dataPath = path.join(__dirname, '..', 'data', 'a2.json');
const a = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

let trChanges = 0, deleted = 0;
const log = [];

for (const [idx, tr] of Object.entries(TR_FIXES)) {
  const i = +idx;
  if (!a[i] || DELETE.has(i)) continue;
  if (a[i].tr !== tr) {
    log.push(`TR ${i}  ${JSON.stringify(a[i].de)} | ${JSON.stringify(a[i].tr)} -> ${JSON.stringify(tr)}`);
    a[i].tr = tr;
    trChanges++;
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
  tr_changes: trChanges,
  deleted,
  mode: apply ? 'APPLY' : 'DRY-RUN',
}, null, 2));

fs.writeFileSync(path.join(__dirname, 'a2_round4_changes.log'), log.join('\n') + '\n');

if (apply) {
  fs.copyFileSync(dataPath, dataPath + '.bak4');
  fs.writeFileSync(
    dataPath,
    JSON.stringify(out, null, 0).replace(/},{/g, '},\n{') + '\n'
  );
  console.log('Yazıldı. Yedek: data/a2.json.bak4');
} else {
  console.log('Dry-run.');
}
