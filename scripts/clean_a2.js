// A2 verisindeki bozuk entry'leri ayıklar.
const fs = require('node:fs');
const path = require('node:path');

const p = path.join(__dirname, '..', 'data', 'a2.json');
const data = JSON.parse(fs.readFileSync(p, 'utf8'));

// İngilizce gloss / etiket sözcükleri (eğer tr veya de'de bunlar geçerse bozuk)
const englishWords = /\b(the|is|my|to|from|with|about|for|because|here|near|that|this|fairly|certainly|almost|dangerous|hobby|favorite|favourite|like|love|guitar|theatre|theater|game|sport|sports|exciting|spannend|knitting|bombing|good|night|always|sometimes|never|something|nothing)\b/i;

function isBadDe(de) {
  if (!de) return true;
  if (de.length > 45) return true;          // tek kelime/isim+artikel olmalı, fazla uzunsa bozuk
  if (englishWords.test(de) && de.length > 25) return true;
  if (/\s{2,}/.test(de)) return true;       // çift boşluk
  if ((de.match(/\s/g) || []).length > 4) return true; // 4+ boşluk = cümle
  return false;
}

function isBadTr(tr) {
  if (!tr) return false;
  if (tr.length > 70) return true;          // makul Türkçe çeviri kısa olur
  if (englishWords.test(tr) && tr.length > 30) return true;
  // Almanca tipik cümle kalıntıları
  if (/\b(ist|sind|haben|machen|spielen|Besondere|Hobby|Hobbys|Lieblings)\b/.test(tr) && tr.length > 25) return true;
  return false;
}

const cleaned = [];
const dropped = { byDe: 0, byTr: 0 };
const samples = [];
for (const it of data) {
  if (isBadDe(it.de)) {
    dropped.byDe++;
    if (samples.length < 5) samples.push('BAD DE: ' + JSON.stringify({de: it.de.slice(0,60), tr: it.tr?.slice(0,40)}));
    continue;
  }
  if (isBadTr(it.tr)) {
    dropped.byTr++;
    if (samples.length < 8) samples.push('BAD TR: ' + JSON.stringify({de: it.de, tr: it.tr.slice(0,60)}));
    continue;
  }
  cleaned.push(it);
}

fs.writeFileSync(p, JSON.stringify(cleaned, null, 0).replace(/},{/g, '},\n{') + '\n');
console.log(`Önce: ${data.length} kayıt`);
console.log(`Atılan (bozuk de): ${dropped.byDe}`);
console.log(`Atılan (bozuk tr): ${dropped.byTr}`);
console.log(`Kalan temiz: ${cleaned.length}`);
console.log('\nÖrnekler:');
samples.forEach(s => console.log('  ' + s));
