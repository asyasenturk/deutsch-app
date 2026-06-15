// A2 ROUND 3 — kalan de-sızıntılı maddeleri temizler
const fs = require('node:fs');
const path = require('node:path');

const DE_FIXES = {
  115:  { de: "eröffnen",                                                     tr: "açmak (resmi olarak), başlatmak" },
  145:  { de: "funktionieren",                                                tr: "çalışmak (cihaz/sistem)" },
  149:  { de: "unterwegs",                                                    tr: "yolda, dışarıda" },
  741:  { de: "mitfeiern",                                                    tr: "birlikte kutlamak" },
  819:  { de: "erwärmen",                                                     tr: "ısıtmak" },
  1264: { de: "hochhelfen",                                                   tr: "yardımla kaldırmak" },
  1351: { de: "heißen",                                                       tr: "anlamına gelmek; adlandırılmak" },
  1413: { de: "unterhalten",                                                  tr: "eğlendirmek" },
  1724: { de: "rufen",                                                        tr: "çağırmak, seslenmek" },
  1823: { de: "unternehmen",                                                  tr: "yapmak, girişmek" },
  1913: { de: "ziehen",                                                       tr: "çekmek; taşınmak" },
};

const DELETE = new Set([
  1925, // "berichtet mir alles, was" / "bei uns im Haus passiert."
]);

const apply = process.argv[2] === 'apply';
const dataPath = path.join(__dirname, '..', 'data', 'a2.json');
const a = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

let deChanges = 0, deleted = 0;
const log = [];

for (const [idx, { de, tr }] of Object.entries(DE_FIXES)) {
  const i = +idx;
  if (!a[i]) { log.push(`MISSING DE ${i}`); continue; }
  if (DELETE.has(i)) continue;
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

fs.writeFileSync(path.join(__dirname, 'a2_round3_changes.log'), log.join('\n') + '\n');

if (apply) {
  fs.copyFileSync(dataPath, dataPath + '.bak3');
  fs.writeFileSync(
    dataPath,
    JSON.stringify(out, null, 0).replace(/},{/g, '},\n{') + '\n'
  );
  console.log('Yazıldı. Yedek: data/a2.json.bak3');
} else {
  console.log('Dry-run. Uygulamak için: node scripts/a2_round3_worker.js apply');
}
