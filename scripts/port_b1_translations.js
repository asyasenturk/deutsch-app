// Eski b1_old.json'daki ex_tr çevirilerini yeni b1.json'a taşır.
// Almanca cümleye göre eşler — birebir eşleşmeyenler atlanır.
const fs = require('node:fs');
const path = require('node:path');

const oldP = path.join(__dirname, '..', 'data', 'b1_old.json');
const newP = path.join(__dirname, '..', 'data', 'b1.json');

const oldData = JSON.parse(fs.readFileSync(oldP, 'utf8'));
const newData = JSON.parse(fs.readFileSync(newP, 'utf8'));

// Eski dosyadaki çevirileri map'le (ex -> ex_tr)
const exMap = {};
let oldWithTr = 0;
for (const it of oldData) {
  if (it.ex && it.ex_tr) {
    exMap[it.ex] = it.ex_tr;
    oldWithTr++;
  }
}
console.log(`Eski B1'de ${oldWithTr} adet ex_tr çevirisi bulundu.`);

// Yeni dosyaya uygula
let added = 0;
let hadAlready = 0;
let stillMissing = 0;
let withoutEx = 0;
for (const it of newData) {
  if (!it.ex) { withoutEx++; continue; }
  if (it.ex_tr) { hadAlready++; continue; }
  if (exMap[it.ex]) {
    it.ex_tr = exMap[it.ex];
    added++;
  } else {
    stillMissing++;
  }
}

// Yaz
fs.writeFileSync(newP, JSON.stringify(newData, null, 0).replace(/},{/g, '},\n{') + '\n');
console.log(`Eklenen ex_tr  : ${added}`);
console.log(`Zaten vardı     : ${hadAlready}`);
console.log(`Hâlâ eksik      : ${stillMissing}`);
console.log(`ex alanı yok    : ${withoutEx}`);
console.log(`Toplam          : ${newData.length}`);
