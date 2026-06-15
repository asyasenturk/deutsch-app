// A2 ROUND 6 — son fragment temizliği + 10 kurtulabilir madde
const fs = require('node:fs');
const path = require('node:path');

const DE_FIXES = {
  751:  { de: "das Mehrgenerationenhaus, Mehrgenerationenhäuser", tr: "çok kuşaklı ev" },
  762:  { de: "gesamt",                                            tr: "toplam, genel" },
  787:  { de: "der/die Nichtraucher, - / Nichtraucherin, -nen",    tr: "sigara içmeyen kişi" },
  790:  { de: "offen",                                             tr: "açık, dürüst" },
  792:  { de: "ordentlich",                                        tr: "düzenli, tertipli" },
  1080: { de: "unkompliziert",                                     tr: "rahat, sorunsuz" },
  1389: { de: "minus",                                             tr: "eksi" },
};

const TR_FIXES = {
  33:   "fikir",
  1302: "omuz",
  1823: "salyangoz",
};

const DELETE = new Set([
  15,   // "fünf" / "Jahren gemacht."
  23,   // "einmal" / "pro Woche."
  164,  // "uns" / "direkt am See."
  192,  // "leben" / "ihren Traum."
  194,  // duplicate of 192
  241,  // "kenne" / "viele Restaurants."
  243,  // duplicate of 241
  518,  // "für" / "freie Kost und Logis."
  571,  // "selbst" / "zum Zimmer."
  592,  // "mit" / "öffentlichen Verkehrsmitteln fahren."
  768,  // "wir" / "schnell Leute kennenlernen."
  848,  // "das" / "ich etwas Besonderes."
  946,  // "wirst" / "du schnell wieder gesund."
  958,  // "sind" / "im August und September."
  1110, // "enthält" / "viel frisches Gemüse."
  1177, // "schön" / "wie Holz."
  1215, // "von" / "seinem Tauschpartner."
  1312, // "liegenden" / "verletzten Person."
  1388, // "es" / "kalt sein und Schnee geben."
  1494, // "ich" / "arbeite jeden Tag 8 Stunden."
  1588, // "der" / "wir alles transportieren können."
  1671, // "gibt" / "es oft Taschendiebe."
  1768, // "überall" / "im Internet angeben."
  1849, // "mit" / "meinen eigenen Bildern."
  1865, // "ist" / "doch Unsinn."
  1877, // "einem" / "einwandfreien Zustand sein."
  1879, // duplicate
  1881, // duplicate
  1901, // "ersten" / "eigenen Song."
  1939, // "in" / "einem privaten Wohnzimmer."
  2037, // "stehen" / "im Vertrag."
  2081, // "maximal" / "vier Kindern pro Gruppe."
  2172, // "zweimal" / "am Tag."
]);

const apply = process.argv[2] === 'apply';
const dataPath = path.join(__dirname, '..', 'data', 'a2.json');
const a = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

let trChanges = 0, deChanges = 0, deleted = 0;
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
  tr_changes: trChanges,
  de_changes: deChanges,
  deleted,
  mode: apply ? 'APPLY' : 'DRY-RUN',
}, null, 2));

if (apply) {
  fs.copyFileSync(dataPath, dataPath + '.bak7');
  fs.writeFileSync(
    dataPath,
    JSON.stringify(out, null, 0).replace(/},{/g, '},\n{') + '\n'
  );
  fs.writeFileSync(path.join(__dirname, 'a2_round6_changes.log'), log.join('\n') + '\n');
  console.log('Yazıldı. Yedek: data/a2.json.bak7');
} else {
  console.log('Dry-run.');
}
