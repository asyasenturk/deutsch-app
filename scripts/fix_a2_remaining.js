// A2 kalan boş çevirileri doldur ve de'yi düzelt
const fs = require('node:fs');
const path = require('node:path');

const F = {
  705:  ["der Schlafplatz, Schlafplätze", "uyku yeri"],
  825:  ["die Spielsachen", "oyuncaklar"],
  826:  ["spazieren", "gezinmek, yürümek"],
  922:  ["die Sauberkeit", "temizlik"],
  1004: ["leihen", "ödünç almak/vermek"],
  1016: ["abstellen", "park etmek, bırakmak"],
  1046: ["übrig", "kalan, artakalan"],
  1110: ["der Dialekt, -e", "lehçe"],
  1194: ["die Verwandtschaft", "akrabalar, akrabalık"],
  1199: ["die Nichte, -n", "kız yeğen"],
  1202: ["der/die Enkel, - / Enkelin, -nen", "torun"],
  1203: ["der/die Verwandte, -n", "akraba"],
  1208: ["irgendwie", "bir şekilde, nasılsa"],
  1219: ["die Firma, Firmen", "firma, şirket"],
  1220: ["die Zusammenarbeit", "işbirliği"],
  1228: ["wiedersehen", "tekrar görüşmek"],
  1241: ["froh", "mutlu, sevinçli"],
  1248: ["der Vorschlag, Vorschläge", "öneri, teklif"],
  1293: ["von", "den, -dan"],
  1314: ["der Zeitpunkt, -e", "zaman, an"],
  1370: ["der/die Anbieter, - / Anbieterin, -nen", "satıcı, sağlayıcı"],
  1371: ["der/die Tauschpartner, - / Tauschpartnerin, -nen", "takas ortağı"],
  1375: ["der Tausch", "takas"],
  1388: ["die Tauschbörse, -n", "takas platformu"],
  1409: ["der Tierschutz", "hayvan koruması"],
  1454: ["der Durchschnitt, -e", "ortalama"],
  1458: ["der Umweltbereich, -e", "çevre alanı"],
  1470: ["wozu", "ne için, niçin"],
  1473: ["kostenfrei", "ücretsiz"],
  1507: ["der Flüchtling, -e", "mülteci"],
  1532: ["das Sprachspiel, -e", "dil oyunu"],
  1538: ["auspacken", "açmak (hediye vb.)"],
  1544: ["die Weihnachtsgans, Weihnachtsgänse", "Noel kazı"],
  1562: ["der Osterhase, -n", "Paskalya tavşanı"],
  1592: ["blöd", "aptal, salakça"],
  1639: ["sich kennenlernen", "tanışmak"],
  1656: ["das Schlafproblem, -e", "uyku sorunu"],
  1665: ["die Krankmeldung, -en", "hastalık raporu"],
  1668: ["übernächst-", "bir sonrakinin sonraki"],
  1686: ["getrennt", "ayrı"],
  1687: ["voneinander", "birbirinden"],
  1693: ["klassisch", "klasik"],
  1699: ["der Krankheitstag, -e", "hastalık günü"],
  1714: ["die Infrastruktur, -en", "altyapı"],
  1754: ["die Yogastunde, -n", "yoga dersi"],
  1758: ["der/die Surflehrer, - / Surflehrerin, -nen", "sörf eğitmeni"],
  1773: ["der Tagesablauf, Tagesabläufe", "günlük plan, gün akışı"],
  1792: ["professionell", "profesyonel"],
  1806: ["vermitteln", "aracılık etmek, ayarlamak"],
  1838: ["einräumen", "yerleştirmek (dolaba)"],
  1857: ["wir", "biz"],
  1864: ["die Wegbeschreibung, -en", "yol tarifi"],
  1880: ["nachsehen", "bakmak, kontrol etmek"],
  1889: ["überprüfen", "kontrol etmek, denetlemek"],
  1890: ["die Gefahr, -en", "tehlike"],
  1960: ["das Ausweisdokument, -e", "kimlik belgesi"],
  1985: ["sorgen", "ilgilenmek, sağlamak"],
  1990: ["die Überweisung, -en", "havale, banka transferi"],
  2003: ["die Datensicherheit", "veri güvenliği"],
  2014: ["der Treffpunkt, -e", "buluşma noktası"],
  2016: ["im Anschluss", "ardından, sonrasında"],
  2040: ["noch nie", "şimdiye kadar hiç"],
  2042: ["das Stadtgebiet, -e", "şehir bölgesi"],
  2054: ["näher-", "daha yakın, daha ayrıntılı"],
  2055: ["die Planung, -en", "planlama"],
  2074: ["das Beste", "en iyisi"],
  2091: ["raufgehen", "yukarı çıkmak"],
  2098: ["etwas Ähnliches", "benzer bir şey"],
  2112: ["die Registrierung, -en", "kayıt"],
  2140: ["erfolgreich", "başarılı"],
  2144: ["weiter-", "daha, ilave"],
  2159: ["wahrmachen", "gerçek kılmak"],
  2173: ["mein", "benim"],
  2224: ["englisch", "İngiliz, İngilizce"],
  2228: ["die Spielekonsole, -n", "oyun konsolu"],
  2270: ["das Ausbildungsjahr, -e", "eğitim/staj yılı"],
  2274: ["beraten", "danışmanlık etmek"],
  2276: ["die Verantwortung, -en", "sorumluluk"],
  2286: ["der/die Laborant, -en / Laborantin, -nen", "laborant"],
  2303: ["einer", "biri (zarf/zamir)"],
  2342: ["der Hort, -e", "okul sonrası bakım yurdu"],
  2395: ["der/die Japaner, - / Japanerin, -nen", "Japon"],
  2430: ["aufstellen", "kurmak, dikmek"],
  2484: ["der Eiertanz, Eiertänze", "yumurta üstünde yürüyüş (deyim: tehlikeli denge)"],
};

const a2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'a2.json'), 'utf8'));
let fixed = 0;
for (const [idx, [de, tr]] of Object.entries(F)) {
  if (a2[idx]) {
    a2[idx].de = de;
    a2[idx].tr = tr;
    delete a2[idx].ex;
    delete a2[idx].ex_tr;
    fixed++;
  }
}

fs.writeFileSync(path.join(__dirname, '..', 'data', 'a2.json'), JSON.stringify(a2, null, 0).replace(/},{/g, '},\n{') + '\n');

// Son kontrol
let empty = 0, longDe = 0;
a2.forEach(x => { if (!x.tr) empty++; if (x.de && x.de.length > 50) longDe++; });
console.log(`Eklenen: ${fixed}`);
console.log(`Kalan boş tr: ${empty}`);
console.log(`Uzun de (>50 char): ${longDe}`);
console.log(`Toplam A2: ${a2.length}`);
