// A2 ROUND 2 WORKER — silme sonrası güncel indekslere göre
// TR_FIXES: tr'yi düzgün Türkçeye çevirir (de zaten doğru)
// DE_FIXES: de'yi düzeltir + tr'yi yazar
// DELETE:    tamamen bozuk/fragment maddeleri siler
//
// Kullanım: node scripts/a2_round2_worker.js          (dry-run)
//           node scripts/a2_round2_worker.js apply    (yazar)

const fs = require('node:fs');
const path = require('node:path');

// ============================================================
// TR_FIXES — sadece tr alanı (de doğru)
// ============================================================
const TR_FIXES = {
  2:    "hula hoop",
  14:   "atlama, zıplama",
  26:   "bunun için",
  36:   "çılgın, deli",
  71:   "korku",
  123:  "yarım, yarı",
  133:  "kibar, nazik",
  144:  "gerçek, hakikat",
  151:  "dakik olmayan",
  155:  "gerçekten",
  162:  "doğrudan; tam",
  167:  "tipik",
  168:  "bölge",
  188:  "taşınma",
  194:  "ya da, yani",
  203:  "şehir koşusu",
  218:  "kendi (sahibi)",
  219:  "dalış okulu",
  270:  "limon kreması",
  279:  "katılmak",
  285:  "varyant, çeşit",
  298:  "soğan",
  306:  "eklemek",
  307:  "bir kez daha, tekrar",
  315:  "öneri, tavsiye",
  320:  "krema, kaymak",
  329:  "marmelat, reçel",
  346:  "fincan",
  352:  "kardeş okul",
  356:  "ulus, millet",
  376:  "röportaj, mülakat",
  396:  "toplam olarak",
  402:  "neyse ki, şükür ki",
  406:  "kendisi, bizzat",
  460:  "çok",
  462:  "yeterli (orta not)",
  463:  "geçer (zayıf not)",
  464:  "yetersiz",
  465:  "kötü, başarısız",
  478:  "özgeçmiş, CV",
  505:  "bazı, birkaç",
  530:  "stajyer, çırak",
  537:  "4 yıldızlı otel",
  549:  "kahvaltı büfesi",
  552:  "günlük, her gün",
  560:  "çamaşır servisi",
  576:  "geceyi geçirmek, konaklamak",
  613:  "şans, talih",
  646:  "geri",
  679:  "bebek arabası, puset",
  703:  "kullanışsız, pratik olmayan",
  725:  "oraya",
  727:  "karşı, karşısında",
  759:  "haftanın günü",
  768:  "liste",
  794:  "birbirine",
  817:  "vegan",
  818:  "hiç (genel olarak)",
  833:  "yoğurt",
  874:  "genç, ergen",
  928:  "kaos, karmaşa",
  935:  "özel (-e özgü)",
  967:  "geride bırakmak",
  976:  "öğrenci yurdu",
  1002: "Obatzde (Bavyera peynir ezmesi)",
  1003: "Bavyera'ya ait",
  1004: "tür, çeşit",
  1006: "tür, türlü",
  1011: "temel form, kök hali",
  1023: "sürücü belgesi, ehliyet",
  1024: "trafik kuralı",
  1044: "giriş, login",
  1045: "kullanıcı adı",
  1052: "giriş alanı",
  1056: "tekrar",
  1064: "teyze, hala",
  1098: "öpmek",
  1104: "tur, parti (oyun)",
  1106: "badminton",
  1107: "sevgili, canım (kişi)",
  1108: "yani, çünkü",
  1114: "bir yerlerde",
  1137: "sipariş tutarı",
  1146: "önce, ilk olarak",
  1164: "teslimat yeri",
  1176: "sipariş edilmiş",
  1181: "salıları",
  1188: "DVD",
  1233: "kışlık mont",
  1241: "güvenlik, emniyet",
  1258: "malzeme, materyal",
  1274: "geceleri",
  1299: "bu konuda, ona dair",
  1313: "ıslak",
  1324: "ağrı, acı",
  1330: "burun",
  1337: "kontrol etmek, sınamak",
  1361: "pazarları",
  1378: "desteklemek",
  1387: "kurabiye",
  1393: "yılbaşı gecesi",
  1397: "karnaval pazartesisi (Rosenmontag)",
  1405: "mont cebi",
  1415: "heyecanlı, gergin",
  1434: "pazartesileri",
  1455: "ara sıra, zaman zaman",
  1466: "atölye, stüdyo",
  1485: "şarap kokteyli (Weinschorle)",
  1496: "okul stresi",
  1498: "dinlenme, rahatlama",
  1503: "saldırganlık",
  1514: "maç tarihi",
  1536: "...yaşındaki kişi",
  1560: "iş raporu",
  1561: "bu yüzden, onun için",
  1586: "sis",
  1598: "kısa sohbet, smalltalk",
  1599: "danışma, tavsiye",
  1634: "ev numarası",
  1636: "başlangıç, kalkış",
  1676: "selobant, yapışkan bant",
  1688: "sözleşme süresi",
  1700: "ürün siparişi",
  1701: "gece vardiyası",
  1725: "cüzdan",
  1726: "hile, numara",
  1730: "dikkatli, uyanık",
  1739: "kamuoyu, halk",
  1747: "kimlik kartı",
  1750: "çalmak (hırsızlık)",
  1785: "şok",
  1809: "kayıt sildirme",
  1813: "kuaför salonu",
  1816: "ev eşyaları",
  1853: "atıştırmalık (Bavyera)",
  1870: "kavram, terim",
  1872: "etrafta durmak, ortalıkta olmak",
  1889: "kez, defa",
  1898: "fesleğen",
  1904: "ahududu",
  1921: "internet sitesi",
  1930: "sergi açılışı",
  1933: "takvim, ajanda",
  1939: "saçmalık",
  1951: "kiralama (verme)",
  1959: "ödünç almak, kiralamak",
  1963: "araç kiralama",
  1968: "uzatmak",
  1976: "ses; oy",
  1977: "hit (şarkı)",
  1980: "şarkı",
  1984: "kariyer",
  1986: "İngiliz, Britanyalı",
  1987: "ön program (konser)",
  1993: "kıta (şarkı/şiir)",
  2009: "şarkı sözü",
  2015: "müzikal, müziğe yatkın",
  2022: "ev konseri",
  2024: "İspanyolca, İspanyol",
  2041: "radyo haberi",
  2042: "uzun metrajlı film",
  2051: "tarife",
  2086: "mesafe",
  2105: "trafik",
  2111: "okul sonrası bakım yeri",
  2112: "laboratuvar",
  2120: "bankacılık işlemi",
  2125: "adres",
  2161: "iş yolu, mesai yolu",
  2164: "kreş",
  2173: "çocuk bakımevi (KiTa)",
  2183: "yaz kapanış dönemi",
  2184: "öğle yemeği servisi",
  2188: "kreş kontenjanı",
  2193: "evlilik",
  2195: "aşk, sevgi",
  2211: "iki dilli",
  2241: "Hıristiyan",
  2242: "aziz, kutsal kişi",
  2247: "Advent çelengi",
  2256: "Mayıs ağacı (Maibaum)",
  2264: "Almanca konuşulan",
  2265: "kilise şenliği (Kirchweih)",
  2282: "denizciler",
  2284: "karalahana",
  2303: "zengin",
};

// ============================================================
// DE_FIXES — hem de hem tr (de'de İngilizce sızıntı ya da bozulma)
// ============================================================
const DE_FIXES = {
  8:    { de: "trainieren",                                                       tr: "antrenman yapmak, çalıştırmak" },
  9:    { de: "ganz",                                                             tr: "tüm, bütün; tamamen" },
  51:   { de: "der/die Profi, -s",                                                tr: "profesyonel, uzman" },
  52:   { de: "weiß",                                                             tr: "biliyor (wissen 3. tekil)" },
  110:  { de: "der/die Allrounder, - / Allrounderin, -nen",                       tr: "her dalda iyi olan kişi" },
  129:  { de: "kaum",                                                             tr: "neredeyse hiç, zar zor" },
  137:  { de: "gemeinsam",                                                        tr: "ortak, birlikte" },
  143:  { de: "ehrlich",                                                          tr: "dürüst" },
  166:  { de: "gemütlich",                                                        tr: "rahat, samimi" },
  257:  { de: "reservieren",                                                      tr: "rezervasyon yapmak" },
  311:  { de: "heiß",                                                             tr: "sıcak" },
  321:  { de: "der Becher, -",                                                    tr: "kupa, kap" },
  394:  { de: "das Abitur (Singular)",                                            tr: "lise bitirme sınavı (Abitur)" },
  538:  { de: "der/die Besucher, - / Besucherin, -nen",                           tr: "ziyaretçi" },
  571:  { de: "im Voraus",                                                        tr: "önceden, peşinen" },
  661:  { de: "verfügen (über)",                                                  tr: "sahip olmak, -e sahip olmak" },
  693:  { de: "der/die Architekt, -en / Architektin, -nen",                       tr: "mimar" },
  719:  { de: "das Treppenhaus, Treppenhäuser",                                   tr: "merdiven boşluğu, merdiven evi" },
  740:  { de: "vorgestern",                                                       tr: "evvelsi gün" },
  784:  { de: "aufregend",                                                        tr: "heyecan verici" },
  785:  { de: "zumachen",                                                         tr: "kapatmak" },
  846:  { de: "natürlich",                                                        tr: "doğal; tabii ki" },
  875:  { de: "der/die Anfänger, - / Anfängerin, -nen",                           tr: "başlangıç seviyesindeki kişi" },
  883:  { de: "lange",                                                            tr: "uzun süre, uzun zamandır" },
  896:  { de: "gut",                                                              tr: "iyi" },
  906:  { de: "merken",                                                           tr: "fark etmek, sezmek" },
  949:  { de: "sprechen",                                                         tr: "konuşmak" },
  951:  { de: "reagieren",                                                        tr: "tepki vermek" },
  956:  { de: "brauchen",                                                         tr: "ihtiyaç duymak" },
  962:  { de: "das Krankenhaus, Krankenhäuser",                                   tr: "hastane" },
  969:  { de: "sagen",                                                            tr: "söylemek" },
  992:  { de: "chillen",                                                          tr: "rahatlamak, dinlenmek" },
  993:  { de: "unterrichten",                                                     tr: "ders vermek, öğretmek" },
  996:  { de: "heutig-",                                                          tr: "bugünkü" },
  1001: { de: "wissen",                                                           tr: "bilmek" },
  1010: { de: "alt, älter, am ältesten",                                          tr: "yaşlı, daha yaşlı, en yaşlı" },
  1029: { de: "der/die Optiker, - / Optikerin, -nen",                             tr: "optisyen, gözlükçü" },
  1047: { de: "seit kurzem",                                                      tr: "yakın zamandır, son zamanlarda" },
  1054: { de: "vorbereitet",                                                      tr: "hazırlanmış" },
  1081: { de: "backen",                                                           tr: "fırında pişirmek" },
  1087: { de: "der/die Geschäftsfreund, -e / Geschäftsfreundin, -nen",            tr: "iş ortağı, iş dostu" },
  1096: { de: "die Zusammenarbeit, -en",                                          tr: "işbirliği" },
  1101: { de: "andere",                                                           tr: "diğerleri, başkaları" },
  1119: { de: "verärgert",                                                        tr: "öfkeli, sinirli" },
  1121: { de: "erstaunt",                                                         tr: "şaşırmış" },
  1126: { de: "präzise",                                                          tr: "kesin, tam" },
  1127: { de: "verliebt",                                                         tr: "âşık" },
  1183: { de: "das Zahlenschloss, Zahlenschlösser",                               tr: "şifreli kilit" },
  1194: { de: "zum Beispiel",                                                     tr: "örneğin" },
  1243: { de: "schon",                                                            tr: "zaten, çoktan" },
  1261: { de: "der Tierschutzverein, -e",                                         tr: "hayvan koruma derneği" },
  1263: { de: "der Rettungsdienst, -e",                                           tr: "ambulans servisi, kurtarma servisi" },
  1264: { de: "der/die Sanitäter, - / Sanitäterin, -nen",                         tr: "sağlık görevlisi, sıhhiye" },
  1286: { de: "der/die Fußballer, - / Fußballerin, -nen",                         tr: "futbolcu" },
  1295: { de: "der/die Elektriker, - / Elektrikerin, -nen",                       tr: "elektrikçi" },
  1297: { de: "mit Hilfe",                                                        tr: "yardımıyla" },
  1304: { de: "tätig",                                                            tr: "aktif, faal, çalışan" },
  1306: { de: "der/die Einwohner, - / Einwohnerin, -nen",                         tr: "sakin, oturan kişi" },
  1311: { de: "der/die Notarzt, Notärzte / Notärztin, -nen",                      tr: "acil doktoru" },
  1312: { de: "der Notarzt (Anruf)",                                              tr: "acil çağrı (doktor)" },
  1320: { de: "um ... zu",                                                        tr: "...mek için" },
  1326: { de: "eng",                                                              tr: "dar, sıkı" },
  1336: { de: "zuerst",                                                           tr: "önce, ilk olarak" },
  1401: { de: "verkleidet",                                                       tr: "kostümlü, kılık değiştirmiş" },
  1402: { de: "der Straßenumzug, Straßenumzüge",                                  tr: "sokak geçidi (karnaval)" },
  1406: { de: "voll",                                                             tr: "dolu" },
  1425: { de: "bloß",                                                             tr: "sadece; nasıl olur" },
  1426: { de: "peinlich",                                                         tr: "utanç verici, mahcup edici" },
  1429: { de: "umsonst",                                                          tr: "bedava; boşuna" },
  1430: { de: "zum Schluss",                                                      tr: "sonunda, en sonunda" },
  1438: { de: "der Ersatzschlüssel, -",                                           tr: "yedek anahtar" },
  1452: { de: "unterhalten",                                                      tr: "eğlendirmek" },
  1463: { de: "jeweils",                                                          tr: "her biri için, sırasıyla" },
  1473: { de: "außerhalb",                                                        tr: "dışında" },
  1484: { de: "woanders",                                                         tr: "başka yerde" },
  1492: { de: "früher",                                                           tr: "daha erken; eskiden" },
  1497: { de: "achten (auf)",                                                     tr: "dikkat etmek" },
  1500: { de: "der/die Kinderpsychologe, -n / Kinderpsychologin, -nen",           tr: "çocuk psikoloğu" },
  1507: { de: "psychologisch",                                                    tr: "psikolojik" },
  1512: { de: "übernächst-",                                                      tr: "bir sonrakinin sonraki" },
  1521: { de: "der/die Busfahrer, - / Busfahrerin, -nen",                         tr: "otobüs şoförü" },
  1540: { de: "der/die Gesundheitsexperte, -n / Gesundheitsexpertin, -nen",      tr: "sağlık uzmanı" },
  1541: { de: "weitergehen",                                                      tr: "devam etmek, sürmek" },
  1548: { de: "der Schnitt, -e",                                                  tr: "ortalama; kesim" },
  1550: { de: "vorletzt-",                                                        tr: "bir öncekinin öncesi" },
  1555: { de: "erledigen",                                                        tr: "halletmek, tamamlamak" },
  1565: { de: "vermuten",                                                         tr: "tahmin etmek, sanmak" },
  1578: { de: "der/die Bauer, -n / Bäuerin, -nen",                                tr: "çiftçi" },
  1579: { de: "der/die Mountainbiker, - / Mountainbikerin, -nen",                 tr: "dağ bisikletçisi" },
  1580: { de: "der/die Wanderer, - / Wanderin, -nen",                             tr: "yürüyüşçü" },
  1592: { de: "der/die Ernährungsberater, - / Ernährungsberaterin, -nen",         tr: "beslenme danışmanı" },
  1593: { de: "die Fastenwanderwoche, -n",                                        tr: "oruçla yürüyüş haftası" },
  1601: { de: "weggehen",                                                         tr: "gitmek, ayrılmak" },
  1610: { de: "stürzen",                                                          tr: "düşmek, devrilmek" },
  1617: { de: "der Umzug, Umzüge",                                                tr: "taşınma" },
  1650: { de: "hersetzen",                                                        tr: "buraya oturmak" },
  1652: { de: "donnerstags",                                                      tr: "perşembeleri" },
  1666: { de: "drüben",                                                           tr: "öbür tarafta" },
  1671: { de: "weitermachen",                                                    tr: "devam etmek" },
  1694: { de: "telefonisch",                                                      tr: "telefonla" },
  1699: { de: "die Spätzle (Plural)",                                             tr: "Spätzle (Alman erişte yemeği)" },
  1722: { de: "der Taschendiebstahl, Taschendiebstähle",                          tr: "yankesicilik" },
  1724: { de: "der/die Taschendieb, -e / Taschendiebin, -nen",                    tr: "yankesici" },
  1735: { de: "zum Beispiel",                                                     tr: "örneğin" },
  1753: { de: "dabeihaben",                                                       tr: "yanında bulundurmak" },
  1755: { de: "der/die Zahnarzt, Zahnärzte / Zahnärztin, -nen",                   tr: "diş hekimi" },
  1757: { de: "lösen",                                                            tr: "çözmek" },
  1779: { de: "eilig",                                                            tr: "acele, aceleci" },
  1796: { de: "der/die Sachbearbeiter, - / Sachbearbeiterin, -nen",               tr: "uzman, dosya sorumlusu" },
  1800: { de: "aus Versehen",                                                     tr: "yanlışlıkla, kazara" },
  1803: { de: "benötigen",                                                        tr: "ihtiyaç duymak, gerek olmak" },
  1805: { de: "bitten",                                                           tr: "rica etmek" },
  1818: { de: "der/die Bürgermeister, - / Bürgermeisterin, -nen",                 tr: "belediye başkanı" },
  1829: { de: "also",                                                             tr: "yani, demek ki" },
  1843: { de: "freundlich",                                                       tr: "arkadaş canlısı, kibar" },
  1855: { de: "der/die Teilnehmer, - / Teilnehmerin, -nen",                       tr: "katılımcı" },
  1863: { de: "führen (zu)",                                                      tr: "yol açmak, neden olmak" },
  1868: { de: "das Frühjahr (Singular)",                                          tr: "ilkbahar" },
  1869: { de: "der Frühling, -e",                                                 tr: "ilkbahar" },
  1877: { de: "der/die Sprecher, - / Sprecherin, -nen",                           tr: "sözcü, konuşmacı" },
  1887: { de: "der/die Organisator, -en / Organisatorin, -nen",                   tr: "organizatör" },
  1888: { de: "enttäuscht",                                                       tr: "hayal kırıklığına uğramış" },
  1926: { de: "der/die Fotograf, -en / Fotografin, -nen",                         tr: "fotoğrafçı" },
  1931: { de: "nachschauen",                                                      tr: "bakmak, gözden geçirmek" },
  1946: { de: "versichert",                                                       tr: "sigortalı" },
  1947: { de: "der/die Nutzer, - / Nutzerin, -nen",                               tr: "kullanıcı" },
  1960: { de: "campen",                                                           tr: "kamp yapmak" },
  1965: { de: "sowieso",                                                          tr: "zaten, her halükarda" },
  1983: { de: "beliebt",                                                          tr: "popüler, sevilen" },
  1996: { de: "ne",                                                               tr: "bir (konuşma dili, eine)" },
  1999: { de: "absurd",                                                           tr: "saçma, absürt" },
  2001: { de: "mitteilsam",                                                       tr: "konuşkan, paylaşımcı" },
  2003: { de: "sowas von",                                                        tr: "öyle, gerçekten" },
  2019: { de: "aufhören",                                                         tr: "durmak, son vermek" },
  2044: { de: "gucken",                                                           tr: "bakmak, izlemek" },
  2048: { de: "der Zeitschriftenladen, Zeitschriftenläden",                       tr: "dergi dükkânı" },
  2050: { de: "verspäten",                                                        tr: "gecikmek" },
  2064: { de: "der/die Kunstpädagoge, -n / Kunstpädagogin, -nen",                 tr: "sanat eğitmeni" },
  2069: { de: "rockig",                                                           tr: "rock tarzında" },
  2093: { de: "von Anfang an",                                                    tr: "en başından beri" },
  2095: { de: "regelmäßig",                                                       tr: "düzenli olarak" },
  2107: { de: "pflegen",                                                          tr: "bakım yapmak, ilgilenmek" },
  2109: { de: "der/die Patient, -en / Patientin, -nen",                           tr: "hasta" },
  2118: { de: "abheben",                                                          tr: "para çekmek (banka)" },
  2146: { de: "bestimmt-",                                                        tr: "belli, kesin" },
  2154: { de: "von ... aus",                                                      tr: "...-den itibaren" },
  2160: { de: "weniger",                                                          tr: "daha az" },
  2174: { de: "die Kindertagesstätte, -n",                                        tr: "çocuk bakımevi (KiTa)" },
  2180: { de: "der/die Babysitter, - / Babysitterin, -nen",                       tr: "bebek bakıcısı" },
  2191: { de: "binational",                                                       tr: "iki uluslu" },
  2197: { de: "mittlerweile",                                                     tr: "bu arada, artık" },
  2199: { de: "der/die Moslem, -s / Moslemin, -nen",                              tr: "Müslüman" },
  2200: { de: "der/die Christ, -en / Christin, -nen",                             tr: "Hıristiyan" },
  2218: { de: "der/die Polizist, -en / Polizistin, -nen",                         tr: "polis" },
  2221: { de: "der/die Tourist, -en / Touristin, -nen",                           tr: "turist" },
  2223: { de: "der/die Praktikant, -en / Praktikantin, -nen",                     tr: "stajyer" },
  2229: { de: "der/die Ausländer, - / Ausländerin, -nen",                         tr: "yabancı" },
  2289: { de: "wegfahren",                                                        tr: "uzağa gitmek (tatile)" },
  2291: { de: "doppelt",                                                          tr: "iki kat, çift" },
  2297: { de: "ausmachen",                                                        tr: "kapatmak (cihaz)" },
  2306: { de: "korrigieren",                                                      tr: "düzeltmek" },
};

// ============================================================
// DELETE — tamamen bozuk fragment maddeler (silinecek)
// ============================================================
const DELETE = new Set([
  153,  // "meine" / "Freunde verlassen kann."
  205,  // "einen" / "Kurs für Tauchlehrer."
  217,  // "einen" / "Job gut."
  429,  // "wohlgefühlt" / "und bin zurück nach Hause."
  467,  // "ist" / "dein Zeugnis? Glückwunsch!"
  486,  // "in" / "Wort und Schrift spoken and written"
  506,  // "die Chance, Au" / "-pair-Oma..."
  546,  // "ist" / "es im Sommer immer kühl."
  604,  // "um" / "Ihre Fahrkarte zu bezahlen."
  758,  // "nächste" / "wishes Herzliche Grüße..."
  797,  // "wichtig" / "für das Zusammenleben..."
  837,  // "mit" / "wenig Fett..."
  903,  // "der" / "ist es schön"
  947,  // "diesem" / "Kurs die englische..."
  955,  // "auf" / "März verschieben?"
  975,  // "von" / "… an from..."
  1031, // "einem" / "Unfall helfen kann."
  1043, // "haben" / "mir die Hälfte..."
  1067, // "sind" / "die Kinder meiner..."
  1071, // "gesehen, das" / "ist bestimmt ein..."
  1079, // "allen" / "auf dem Familienfest."
  1086, // "wieder" / "nach Südamerika..."
  1174, // "schriftliche" / "Nachricht von..."
  1262, // "arbeitet" / "in einem Tierschutzverein..."
  1265, // "einem" / "Unfall um..."
  1269, // "körperliches" / "Handicap haben."
  1271, // duplicate of 1269
  1305, // "tätig" / "als Frauen..."
  1321, // "um" / "gut helfen..."
  1338, // duplicate of 1336 zuerst
  1370, // "alle" / "singen können..."
  1373, // "einem" / "anderen Land..."
  1376, // "baut" / "und bastelt etwas..."
  1421, // "für" / "den Tannenbaum."
  1427, // "peinlich!" / "Wie sehe ich..."
  1436, // "unter during" / "am Wochenende..."
  1441, // "du" / "mit? Worauf?..."
  1450, // "gemütlichen" / "Einkaufsbummel ein."
  1460, // "aus" / "der Region probieren."
  1462, // "für" / "die jungen..."
  1465, // "vielen" / "Läden einkaufen."
  1504, // "sie" / "sich entspannen..."
  1508, // "weil, dass" / ", wenn, damit"
  1523, // "schon" / "den Techniker..."
  1528, // "mehr" / "als 45 Stunden."
  1530, // "kann" / "man nicht..."
  1534, // "in" / "die Pause."
  1537, // "ihre" / "E-Mails vor und nach..."
  1551, // "year before last" / "war schon..."
  1562, // "sich Herr" / "Peters..."
  1575, // "auf" / "die Almwiesen."
  1582, // "jede" / "Menge Arbeit..."
  1602, // "weggegangen" / "und nach Chile..."
  1614, // "für" / "Kinder und..."
  1616, // "der" / "fällst"
  1628, // "verschiedenen" / "Größen mit."
  1653, // "montags" / "bis donnerstags..." duplicate
  1698, // "richtig, ich" / "komme nicht..."
  1702, // "ganze" / "Nacht arbeiten..."
  1784, // "meine" / "Geldbörse weg ist."
  1787, // "zur" / "Arbeit kommen..."
  1810, // "macht" / "die KFZ-Zulassung."
  1817, // "ich" / "ein schönes Besteck..."
  1820, // "des" / "Rathauscenters..."
  1838, // "vom" / "PC aus..."
  1857, // "auf" / "Hochdeutsch..."
  1860, // "gemeinsamen" / "Aufräumen auf."
  1864, // "zu" / "einem positiven..."
  1883, // "bleiben" / "in Erinnerung."
  1885, // duplicate of 1883
  1912, // "habe" / "ich auch einen Garten."
  1920, // "angeschaut?" / "Nein, leider..."
  1945, // "kann" / "hierherkommen..."
  1962, // "usemycar" / "von jemandem..."
  1969, // "einen" / "Tag verlängern?"
  1973, // "richtig?" / "Es macht..."
  1978, // "kurz" / "die Welt retten..."
  2010, // "er" / "16 Jahre alt war..."
  2011, // "der" / "er Popstar werden..."
  2018, // "durch" / "Kleinstädte gemacht."
  2029, // "wir" / "nach 21 Uhr..."
  2034, // "das" / "ich immer Nachrichten..."
  2046, // "über" / "die Natur."
  2058, // "mein" / "Navi mir den Weg."
  2061, // "der" / "meine Videos..."
  2091, // "arbeiten" / "während der Berufsausbildung..."
  2129, // "einmal" / "in Ruhe durch."
  2143, // "muss, nennt" / "man das..."
  2144, // "an" / "den Nordwesten..."
  2152, // "zwei" / "Stunden pro..."
  2156, // "ist" / "in Elternzeit..."
  2165, // "einer" / "Kinderkrippe..."
  2167, // "kümmern" / "sich um die Kinder."
  2177, // "von" / "drei Jahren..."
  2178, // "drei" / "Jahren..."
  2189, // "kleinen" / "Sohn beantragt..."
  2192, // "in" / "einer binationalen Ehe."
  2194, // duplicate of 2192
  2204, // "gibt" / "es aber trotzdem..."
  2207, // "richtigen" / "Erziehung..."
  2213, // "weg" / "away Mónica..."
  2214, // "schwer, dass" / "ihre Familie..."
  2216, // "zum Beispiel" / "dass er nicht..."
  2219, // "ist" / "ein Unfall passiert."
  2224, // "uns" / "in der Firma..."
  2226, // "unterhalten?" / "Ja, er ist sehr nett!"
  2228, // "erst" / "später nach..."
  2230, // "vielen" / "verschiedenen..."
  2239, // "gehen, bekommen" / "sie eine Schultüte..."
  2245, // "mit" / "Musik durch..."
  2254, // "in" / "der Walpurgisnacht..."
  2255, // duplicate of 2254
  2257, // "einem" / "Mädchen..."
  2261, // "einen" / "Spaziergang..."
  2266, // "wurde" / "an diesem Tag..."
  2268, // "alle" / "Menschen sind verkleidet."
  2270, // duplicate of 2268
  2272, // "mit" / "dem Nikolaus..."
  2274, // duplicate of 2272
  2279, // "mit" / "Lärm und Licht..."
  2290, // "fahren" / "nach Italien."
  2302, // "der" / "dem die Lebensmittel..."
]);

// ============================================================
// Uygula
// ============================================================
const apply = process.argv[2] === 'apply';
const dataPath = path.join(__dirname, '..', 'data', 'a2.json');
const a = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

let trChanges = 0, deChanges = 0, deleted = 0, missing = 0;
const log = [];

// Önce TR_FIXES uygula
for (const [idx, tr] of Object.entries(TR_FIXES)) {
  const i = +idx;
  if (!a[i]) { missing++; log.push(`MISSING TR ${i}`); continue; }
  if (DELETE.has(i)) { log.push(`SKIP TR ${i} (DELETE'de)`); continue; }
  if (a[i].tr !== tr) {
    log.push(`TR ${i}  ${JSON.stringify(a[i].de)} | ${JSON.stringify(a[i].tr)} -> ${JSON.stringify(tr)}`);
    a[i].tr = tr;
    trChanges++;
  }
}

// DE_FIXES uygula
for (const [idx, { de, tr }] of Object.entries(DE_FIXES)) {
  const i = +idx;
  if (!a[i]) { missing++; log.push(`MISSING DE ${i}`); continue; }
  if (DELETE.has(i)) { log.push(`SKIP DE ${i} (DELETE'de)`); continue; }
  if (a[i].de !== de || a[i].tr !== tr) {
    log.push(`DE ${i}  de:${JSON.stringify(a[i].de)} -> ${JSON.stringify(de)} | tr:${JSON.stringify(a[i].tr)} -> ${JSON.stringify(tr)}`);
    a[i].de = de;
    a[i].tr = tr;
    deChanges++;
  }
}

// DELETE: tersten sil (indeks kaymasın)
const delIdx = [...DELETE].sort((x,y)=>y-x);
const out = a.slice();
for (const i of delIdx) {
  if (!out[i]) continue;
  log.push(`DEL ${i}  de:${JSON.stringify(out[i].de)} | tr:${JSON.stringify(out[i].tr)}`);
  out.splice(i, 1);
  deleted++;
}

const summary = {
  before_total: a.length,
  after_total: out.length,
  tr_changes: trChanges,
  de_changes: deChanges,
  deleted,
  missing,
  mode: apply ? 'APPLY' : 'DRY-RUN',
};
console.log(JSON.stringify(summary, null, 2));

fs.writeFileSync(path.join(__dirname, 'a2_round2_changes.log'), log.join('\n') + '\n');

if (apply) {
  // Yedek al
  fs.copyFileSync(dataPath, dataPath + '.bak2');
  fs.writeFileSync(
    dataPath,
    JSON.stringify(out, null, 0).replace(/},{/g, '},\n{') + '\n'
  );
  console.log('Yazıldı: data/a2.json (yedek: data/a2.json.bak2)');
} else {
  console.log('Dry-run modu. Uygulamak için: node scripts/a2_round2_worker.js apply');
}
