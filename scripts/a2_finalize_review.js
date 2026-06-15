// REVIEW listesini detaylı dosyaya yaz
const fs = require('node:fs');
const path = require('node:path');

const a = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'a2.json'), 'utf8'));
const worker = fs.readFileSync(path.join(__dirname, 'a2_master_worker.js'), 'utf8');

const m = worker.match(/REVIEW = new Set\(\[([\s\S]*?)\]\);/);
const reviewIds = [...m[1].matchAll(/(\d+)/g)].map(x => +x[1]);

// Kalan Almanca-karışık (REVIEW'da olmayan)
const stillMixed = [];
a.forEach((x, i) => {
  if (reviewIds.includes(i)) return;
  const tr = (x.tr || '').trim();
  if (!tr) return;
  const hasTR = /[çğıİöşüÇĞÖŞÜ]/.test(tr);
  if (hasTR) return;
  const hasGerman = /\b(ist|haben|nicht|der|die|das|den|dem|für|mit|sich|auf)\b/.test(tr) || /[äöüß]/.test(tr);
  if (hasGerman) stillMixed.push(i);
});

const lines = ['# A2 — MANUEL İNCELEME GEREKEN MADDELER', '', `# Toplam: ${reviewIds.length + stillMixed.length} madde`, ''];

lines.push('## REVIEW listesinde (cümle parçası / yapısal bozuk)');
lines.push('');
reviewIds.sort((a, b) => a - b).forEach(i => {
  const x = a[i];
  lines.push(`${String(i).padStart(4)} | de: ${JSON.stringify(x.de)} | tr: ${JSON.stringify(x.tr).slice(0, 100)}`);
});

lines.push('', '## Hâlâ Almanca cümle parçası içeren tr alanları (REVIEW dışı)');
lines.push('');
stillMixed.forEach(i => {
  const x = a[i];
  lines.push(`${String(i).padStart(4)} | de: ${JSON.stringify(x.de)} | tr: ${JSON.stringify(x.tr).slice(0, 100)}`);
});

fs.writeFileSync(path.join(__dirname, 'a2_review.txt'), lines.join('\n') + '\n');

console.log('REVIEW içinde:', reviewIds.length);
console.log('Geriye Almanca karışık:', stillMixed.length);
console.log('Toplam manuel inceleme:', reviewIds.length + stillMixed.length);
console.log('Yazıldı: scripts/a2_review.txt');
