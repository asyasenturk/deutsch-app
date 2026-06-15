// REVIEW listesindeki fragmentleri data/a2.json'dan kalıcı olarak sil
// Çalıştırmadan önce yedek alınır: data/a2.json.bak
const fs = require('node:fs');
const path = require('node:path');

const dataPath = path.join(__dirname, '..', 'data', 'a2.json');
const workerPath = path.join(__dirname, 'a2_master_worker.js');

const a = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const worker = fs.readFileSync(workerPath, 'utf8');

// REVIEW set'ini parse et
const m = worker.match(/REVIEW = new Set\(\[([\s\S]*?)\]\);/);
if (!m) { console.error('REVIEW set bulunamadı'); process.exit(1); }
const reviewIds = new Set([...m[1].matchAll(/(\d+)/g)].map(x => +x[1]));

console.log(`Silinecek madde: ${reviewIds.size}`);
console.log(`Silmeden önce toplam: ${a.length}`);

// Yedek
fs.writeFileSync(dataPath + '.bak', JSON.stringify(a, null, 0).replace(/},{/g, '},\n{') + '\n');
console.log('Yedek alındı: data/a2.json.bak');

// Sil + yeni dizide eski-indeks haritasını tut
const oldToNew = {};
const cleaned = [];
a.forEach((x, i) => {
  if (reviewIds.has(i)) return;
  oldToNew[i] = cleaned.length;
  cleaned.push(x);
});

fs.writeFileSync(dataPath, JSON.stringify(cleaned, null, 0).replace(/},{/g, '},\n{') + '\n');
fs.writeFileSync(path.join(__dirname, 'a2_index_map.json'), JSON.stringify(oldToNew, null, 0));

console.log(`Silmeden sonra toplam: ${cleaned.length}`);
console.log('Yazıldı: data/a2.json (yeni), scripts/a2_index_map.json (eski→yeni indeks)');
