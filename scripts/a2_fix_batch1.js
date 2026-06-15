// A2 Batch 1: Tip A güvenli ilk parti
// Sadece tr'yi düzeltir; zaten Türkçe olanlar ve yapısal hasarlılar atlanır.
const fs = require('node:fs');
const path = require('node:path');

// idx -> doğru Türkçe çeviri (de değişmiyor)
const FIXES = {
  1:   "yamaç paraşütü",
  3:   "paraşütle atlama",
  16:  "adrenalin patlaması",
  23:  "mutlaka, kesinlikle",
  28:  "turnuva",
  32:  "örmek",
  33:  "örgü topluluğu",
  34:  "atkı",
  35:  "bere, başlık",
  36:  "renkli, alacalı",
  37:  "sıkıcı",
  44:  "dans etmek",
  45:  "müzik",
  46:  "şarkı söylemek",
  47:  "tango",
  48:  "spor salonu",
  56:  "zaten, hâlihazırda",
  59:  "doğal olarak, tabii ki",
  60:  "cevaplamak",
  61:  "kez, defa",
  62:  "harika, muhteşem",
  66:  "duygu, his",
  75:  "kaza",
  81:  "atlamak, zıplamak",
  86:  "doğa",
  87:  "matematik sınavı",
  89:  "maraton",
  94:  "etkinlik, aktivite",
  95:  "planlamak",
  96:  "rüzgar sörfü",
  97:  "uçurtma sörfü",
  98:  "seçmek",
  99:  "kültür hayranı",
  100: "düzenlemek, organize etmek",
  103: "dönüş yolculuğu",
  104: "en geç",
  106: "sörf kursu",
  107: "sörf tatili",
  110: "ilginç",
  111: "en azından",
  112: "tırmanış kursu",
  118: "senaryo, metin",
  119: "yaratıcı",
  120: "esnek",
  121: "takım, ekip",
  125: "sahne",
  126: "ile, vasıtasıyla",
  127: "ziyaret",
  128: "şey, mesele",
  132: "fotoğrafçılık",
  135: "eğlence, keyif",
  136: "önceden, ilk önce",
  148: "mizah duygusu",
  160: "güvenilir",
  164: "görüş, fikir",
  165: "hakkında, üzerine",
  167: "aktif",
  176: "koşu yapmak (jogging)",
  178: "gecikme",
  194: "dilek, arzu",
  197: "dahil",
  198: "gerçekleşmek, yer almak",
  199: "barbekü partisi",
  200: "ücretsiz",
  202: "tur, gezi",
  207: "stres",
  209: "etkinlik",
  210: "ofis, büro",
  211: "etkinlik, organizasyon",
  213: "veda, ayrılış",
  216: "kişi",
  220: "rüya, hayal",
  221: "üniversite",
  226: "sağlıklı",
};

const a = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'a2.json'), 'utf8'));
let applied = 0, skipped = 0;
for (const [idx, tr] of Object.entries(FIXES)) {
  const i = +idx;
  if (!a[i]) { skipped++; console.log('MISSING', i); continue; }
  a[i].tr = tr;
  applied++;
}

fs.writeFileSync(
  path.join(__dirname, '..', 'data', 'a2.json'),
  JSON.stringify(a, null, 0).replace(/},{/g, '},\n{') + '\n'
);
console.log(`Batch 1: ${applied} madde düzeltildi, ${skipped} atlandı`);
console.log(`Toplam Tip A hedefi: ${Object.keys(FIXES).length}`);
