// Yapısal hasarlı maddeleri (de'si bozuk olanları) tespit edip review.txt'e yaz
const fs = require('node:fs');
const path = require('node:path');

const a = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'a2.json'), 'utf8'));

// Sezgisel: de alanı geçerli Almanca kelime gibi görünmüyor mu?
const looksLikeValidGerman = (de) => {
  if (!de) return false;
  const s = de.trim();
  // der/die/das ile başlayan isimler
  if (/^(der|die|das|der\/die)\s+[A-ZÄÖÜ]/.test(s)) return true;
  // Almanca özel karakter
  if (/[äöüÄÖÜß]/.test(s)) return true;
  // Almanca'ya özgü ek pattern'ler
  if (/(en|n|t|ig|isch|lich|bar|haft|sam|los|voll|chen|lein|keit|heit|ung|schaft)$/.test(s) && s.length > 3) return true;
  // Tek harfli edatlar/zamirler vb.
  if (/^(in|zu|an|am|um|im|er|es|du|ich|wir|ihr|sie|mit|von|bei|aus|auf|nach|über|unter|vor|seit|für|gegen|ohne|durch|bis|ab|als|wie|wo|was|wer|wen|wem|wenn|denn|aber|oder|und|so|ja|nein|nicht|kein|noch|schon|sehr|hier|dort|da|nun|jetzt|dann|heute|morgen|gestern|gut|alt|neu|groß|klein|viel|wenig|mehr|halb|ganz|gleich|fast|bald|nie|oft|immer|einmal|zweimal|gern|leider|vielleicht|wirklich)$/i.test(s)) return true;
  // Çok kısa lowercase: bazı modal/yardımcı fiil ekleri
  if (s.length <= 4 && /^[a-zäöüß]+$/.test(s)) return true;
  // Composite Almanca (Adrenalinkick gibi) — büyük harfle başlıyor
  if (/^[A-ZÄÖÜ][a-zäöüß]+/.test(s)) return true;
  // -en biten fiiller
  if (/^[a-zäöüß]+en$/.test(s) && s.length > 3) return true;
  // İngilizce gibi görünenler (sadece ASCII lowercase, Almanca eki yok, kısa değil)
  return false;
};

// Net İngilizce kelime sızıntısı (de'nin TAMAMI İngilizce ya da " to ", " of " gibi belirteç içeriyor)
const pureEnglishWords = new Set([
  'parachute','coach','tandem','jump','company','graphic','artist','employee','colleague',
  'professional','works','outing','trip','backgammon','actor','expert','marathon','tango',
  'paragliding','script','team','event','team','party','manager','journalist','pilot',
  'sport','hobby','design','test','fitness','total','partner','workshop'
]);
const hasEnglishMarker = (s) => / to | of | with | from |^to |^the |^a /.test(s) || /, (to|of|with|the|a)\b/.test(s);

const damaged = [];
a.forEach((x, i) => {
  if (!x) return;
  const de = (x.de || '').trim();
  const tr = (x.tr || '').trim();
  const deLc = de.toLowerCase().replace(/[,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const deWords = deLc.split(' ').filter(Boolean);

  // Vaka 1: de İngilizce belirteç içeriyor ("to ", "of ", vs.)
  if (hasEnglishMarker(de)) {
    damaged.push({ i, de, tr, reason: 'de_has_english_marker' });
    return;
  }
  // Vaka 2: de tek/çift kelime ve hepsi pureEnglishWords içinde
  if (deWords.length <= 3 && deWords.every(w => pureEnglishWords.has(w))) {
    damaged.push({ i, de, tr, reason: 'de_is_pure_english' });
    return;
  }
  // Vaka 3: de virgülle ayrılmış ama anlamsız ("employee, co", "works outing, works")
  if (/^[a-z]+, [a-z-]+$/.test(de) && !/^(der|die|das)/.test(de) && !/[äöüß]/.test(de)) {
    if (deWords.some(w => pureEnglishWords.has(w))) {
      damaged.push({ i, de, tr, reason: 'de_split_english' });
    }
  }
});

console.log('Tespit edilen yapısal hasarlı madde:', damaged.length);
const lines = damaged.map(d => `${d.i}\t${d.reason}\tde: ${JSON.stringify(d.de)}\ttr: ${JSON.stringify(d.tr)}`);
fs.writeFileSync(path.join(__dirname, 'a2_review.txt'),
  '# A2 Yapısal Hasarlı Maddeler (manuel inceleme gerekli)\n' +
  '# Format: idx<TAB>reason<TAB>de<TAB>tr\n' +
  '# de alanı İngilizce ya da geçerli Almanca kelime değil.\n\n' +
  lines.join('\n') + '\n'
);
fs.writeFileSync(path.join(__dirname, 'a2_review_indices.json'),
  JSON.stringify(damaged.map(d => d.i), null, 0)
);
console.log('Yazıldı: scripts/a2_review.txt ve a2_review_indices.json');
