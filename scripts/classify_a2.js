// A2 bozuk maddeleri tipiyle çıkar
const fs = require('node:fs');
const path = require('node:path');

const a = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'a2.json'), 'utf8'));

const hasTR = s => /[çğıİöşüÇĞÖŞÜ]/.test(s);
const isEnglishWord = s => /^[a-z][a-zA-Z, /-]*$/.test(s) && !hasTR(s);
const startsWithEnglishWord = s => /^(to )?[a-z][a-z-]+( [a-z]+)?\s+[A-ZÄÖÜ]/.test(s);
const hasEnglishInDe = s => / to [a-z]| [a-z]{3,}(ous|ly|ing|ed|tion)\b| [a-z]+ [a-z]+ [a-z]+\b/.test(s);
const looksLikeFragment = s => /^[a-zäöüß]/.test(s) && (/[!?]/.test(s) || /\boder\?$/.test(s));

const out = { typeA: [], typeB: [], typeC: [], typeD: [], suspicious: [] };

a.forEach((x, i) => {
  if (!x) return;
  const de = (x.de || '').trim();
  const tr = (x.tr || '').trim();
  const trWords = tr.split(/\s+/).filter(Boolean);
  const deWords = de.split(/\s+/).filter(Boolean);

  // Fragment / yapısal bozuk (Tip D)
  if (
    looksLikeFragment(de) ||
    looksLikeFragment(tr) ||
    /[!?]/.test(de) ||
    (trWords.length > 0 && /[!?]/.test(tr) && trWords.length < 5) ||
    deWords.length > 5
  ) {
    out.typeD.push({ i, de, tr, ex: x.ex || '', ex_tr: x.ex_tr || '' });
    return;
  }

  // de içinde İngilizce parça (Tip C)
  if (hasEnglishInDe(de) && deWords.length > 2) {
    out.typeC.push({ i, de, tr });
    return;
  }

  // tr İngilizce + Almanca örnek karışık (Tip B)
  if (trWords.length > 3 && !hasTR(tr) && /[A-ZÄÖÜ][a-zäöüß]/.test(tr)) {
    out.typeB.push({ i, de, tr });
    return;
  }

  // tr sadece İngilizce (Tip A)
  if (trWords.length > 0 && trWords.length <= 3 && !hasTR(tr) && isEnglishWord(tr)) {
    out.typeA.push({ i, de, tr });
    return;
  }

  // Şüpheli ama net değil
  if (tr && !hasTR(tr) && !/^[0-9]/.test(tr)) {
    out.suspicious.push({ i, de, tr });
  }
});

const summary = {
  total: a.length,
  typeA_englishOnly: out.typeA.length,
  typeB_mixedEnglishGerman: out.typeB.length,
  typeC_brokenDe: out.typeC.length,
  typeD_fragments: out.typeD.length,
  suspicious: out.suspicious.length,
};
console.log(summary);

fs.writeFileSync(
  path.join(__dirname, 'a2_to_fix.json'),
  JSON.stringify(out, null, 2)
);
console.log('Yazıldı: scripts/a2_to_fix.json');
