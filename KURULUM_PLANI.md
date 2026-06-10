# Almanca Öğrenme Platformu — Claude Code Kurulum Planı

Kendi sunucunda **girişli, A1/A2/B1 seviyeli, her cihazda güncel kalan** bir kelime öğrenme platformu kurmak için hazırlandı.

---

## 1. Ne kuruyoruz (mimari özet)

```
Tarayıcı (frontend)  ⇄  Express API  ⇄  SQLite (tek dosya veritabanı)
        │                    │
   giriş ekranı         bcrypt + oturum cookie
   A1/A2/B1 kartlar     /api/login, /api/state ...
```

- **Backend:** Node.js + Express
- **Veritabanı:** SQLite (`better-sqlite3`) — tek dosya, yedeği = dosyayı kopyalamak
- **Giriş:** kullanıcı adı + şifre; şifreler **bcrypt** ile hash'li (asla düz metin), oturum httpOnly cookie ile
- **Frontend:** statik HTML/CSS/JS (mevcut app'lerin tasarımı), Express'in altından servis edilir
- **Senkron:** her "Biliyorum" / pozisyon değişiminde durum sunucuya yazılır; girişte sunucudan yüklenir → telefon/PC fark etmez, hep güncel
- **HTTPS:** Caddy reverse proxy (otomatik sertifika)

## 2. Hazır dosyalar (bu sohbetten indir)

Proje klasörüne bir `data/` koy ve içine at:
- `a1.json` — 148 kelime (kategorilere ayrılmış, örnek cümleli)
- `b1.json` — 852 kelime (Ünite 1–3, örnek cümleli)
- `a2.json` — şimdilik boş `[]` (sonra Goethe A2 listesiyle doldururuz)

Veri formatı (her seviye aynı): `[{ "group": "...", "de": "...", "tr": "...", "ex": "..." }]`

## 3. Hedef klasör yapısı

```
deutsch-app/
├─ server.js          # Express uygulaması
├─ db.js              # SQLite kurulum + tablolar
├─ package.json
├─ .env.example       # SESSION_SECRET, PORT
├─ Caddyfile          # HTTPS reverse proxy
├─ data/
│  ├─ a1.json
│  ├─ a2.json
│  └─ b1.json
└─ public/
   ├─ index.html      # giriş + uygulama
   ├─ app.js
   └─ styles.css
```

---

## 4. Claude Code'a verilecek PROMPT

> Sunucunda boş bir `deutsch-app/` klasörü oluştur, içine `data/` koyup üç JSON'u at, klasörde Claude Code'u başlat ve aşağıdaki metni olduğu gibi yapıştır.

```
Bir Almanca kelime öğrenme platformu kuracağız. Node.js + Express + SQLite ile,
tek sunucuda çalışan, girişli ve kullanıcıya özel ilerleme kaydeden bir uygulama.
Aşağıdaki spesifikasyonu eksiksiz uygula ve çalışır hale getir.

## Yığın
- Node.js + Express
- SQLite (better-sqlite3) — tek dosya: data/app.db
- Şifre güvenliği: bcrypt (cost 12)
- Oturum: express-session + connect-sqlite3 (oturumlar diskte kalsın)
- Giriş denemesi sınırı: express-rate-limit (login/register için 5 dk'da 20 deneme)
- Frontend statik dosyalar, Express tarafından public/ klasöründen servis edilir
  (aynı origin, CORS gerekmez)

## Veri
- data/a1.json, data/a2.json, data/b1.json zaten klasörde mevcut.
- Format: [{ "group": string, "de": string, "tr": string, "ex": string }]
- Bunları DEĞİŞTİRME, sadece API'den oku ve servis et.

## Veritabanı şeması (db.js, ilk açılışta oluştur)
- users(id INTEGER PK, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
         created_at TEXT DEFAULT CURRENT_TIMESTAMP)
- user_state(user_id INTEGER PK REFERENCES users(id), data TEXT NOT NULL DEFAULT '{}',
             updated_at TEXT)
  (data = kullanıcının tüm ilerlemesini tutan JSON blob: bilinen kelimeler,
   son seçilen seviye, son kart pozisyonu vb.)

## API uçları (hepsi parametreli sorgu / prepared statement kullansın)
- POST /api/register {username, password}
    - username 3–30 karakter, password en az 6 karakter doğrula
    - username benzersiz değilse 409 dön
    - bcrypt ile hash'le, kullanıcı oluştur, boş user_state ekle, oturum başlat
    - { username } dön (password_hash'i ASLA dönme)
- POST /api/login {username, password}
    - doğrula, yanlışsa 401 (kullanıcı var mı belli etmeyen genel mesaj)
    - oturum başlat, { username } dön
- POST /api/logout → oturumu kapat
- GET  /api/me → oturum varsa { username, state } (state = user_state.data parse edilmiş), yoksa 401
- PUT  /api/state {data}  (oturum zorunlu)
    - gelen data'yı JSON.stringify edip user_state'e upsert et, updated_at güncelle
    - 5MB üstü reddet
- GET  /api/vocab/:level  (level ∈ a1,a2,b1; başka değer 404)
    - ilgili data/{level}.json içeriğini dön (oturum zorunlu olmasın, herkes okuyabilir)

## Güvenlik (zorunlu)
- Şifre ASLA düz metin saklanmaz; sadece bcrypt hash.
- password_hash hiçbir yanıtta dönmez.
- Oturum cookie: httpOnly:true, sameSite:'lax', secure:true (production'da),
  makul maxAge (ör. 30 gün).
- SESSION_SECRET .env'den okunsun; .env.example oluştur (SESSION_SECRET, PORT=3000).
- Tüm SQL prepared statement ile; kullanıcı girdisi doğrudan sorguya gömülmez.
- Korunması gereken uçlarda oturum kontrolü yapan bir requireAuth middleware yaz.

## Frontend (public/)
Tek sayfa uygulaması, sade ve mobil uyumlu. Tasarım dili: sıcak "parchment" arka plan,
başlıklarda 'Fraunces' serif, gövdede 'Hanken Grotesk' (Google Fonts CDN).
Ekranlar:
1) Giriş/Kayıt ekranı: kullanıcı adı + şifre; "Giriş yap" ve "Kayıt ol" sekmeleri.
   Hata mesajlarını kullanıcıya göster.
2) Giriş sonrası uygulama:
   - Üstte seviye seçici: A1 / A2 / B1 (seçilen seviye /api/vocab/:level'den yüklenir)
   - Seviye içinde "group" alanına göre filtre çipleri (A1'de kategoriler, B1'de üniteler)
   - Kelime Kartları modu: Almanca ↔ Türkçe çevrilen kart, örnek cümle, ileri/geri,
     "Biliyorum / Tekrar et", "sadece bilmediklerim" filtresi, karıştır,
     mobilde sola/sağa kaydırma.
   - Quiz modu: çoktan seçmeli (4 şık), hem TR→DE hem DE→TR, skor + üst üste doğru.
   - İlerleme çubuğu (o seviyede kaç kelime "biliniyor").
   - "Çıkış" butonu.
3) Senkron:
   - Tüm kullanıcı durumu tek bir state objesinde tutulsun:
     { known: { "b1|die Burg, -en": true, ... }, lastLevel, lastGroup, lastIdx, hideKnown }
   - Açılışta GET /api/me ile state yüklenir.
   - Her değişimde (known işaretleme, pozisyon, seviye) state DEBOUNCE'lu (ör. 800ms)
     PUT /api/state ile sunucuya yazılır. Böylece her cihazda güncel kalır.
   - Ağ hatasına karşı localStorage'a da kopya yazılabilir (opsiyonel önbellek),
     ama sunucu ana kaynaktır.

## Çalıştırma
- package.json'a "start": "node server.js" script'i ekle.
- README.md yaz: kurulum (npm install), .env oluşturma, başlatma, yedekleme (data/app.db kopyala).
- Sunucu PORT (varsayılan 3000) dinlesin.

Önce projeyi kur ve çalıştır, sonra register → login → bir kelimeyi "biliyorum" işaretle →
sayfayı yenile → state'in sunucudan geri geldiğini doğrula. Bana test sonucunu raporla.
```

---

## 5. Çalıştırma ve HTTPS (Claude Code bitirince)

```bash
cd deutsch-app
npm install
cp .env.example .env
# .env içine güçlü bir SESSION_SECRET yaz (ör: openssl rand -hex 32)
npm start          # http://localhost:3000
```

**HTTPS için Caddy** (alan adın varsa, otomatik sertifika). `Caddyfile`:

```
ogrenme.alanadin.com {
    reverse_proxy localhost:3000
}
```

```bash
caddy run        # ya da: sudo caddy start
```

Süreklilik için `pm2` veya bir systemd servisi kullan (`pm2 start server.js --name deutsch`).

## 6. Yedekleme

SQLite tek dosya olduğu için yedek çok kolay — `data/app.db` dosyasını kopyala:

```bash
cp data/app.db backups/app_$(date +%F).db
```

İstersen bunu günlük cron'a bağlarsın.

---

## 7. Sonraki adımlar / fikirler

- **A2 seviyesi:** Goethe A2 kelime listesini bana ver, B1'de yaptığım gibi çıkarıp `a2.json`'a koyarım.
- **Genitiv / dilbilgisi dersleri** ve **Artikel quiz'i** (A1) modüllerini de frontend'e ekleyebiliriz.
- "Günlük hedef" ve basit istatistik (gün gün kaç kelime öğrenildi) eklenebilir.
- Birden çok kullanıcı olacaksa (arkadaşlarınla), bu yapı onu da kaldırır.

> Not: Şifre/oturum güvenliğini Claude Code'un spec'teki gibi (bcrypt + httpOnly cookie + HTTPS) kurduğundan emin ol. Bir şey takılırsa hata mesajını bana getir, çözeriz.

## Ek teknik kurallar (sık çıkan tuzaklar — zorunlu)
- Node 18+ LTS varsay, CommonJS kullan (sadelik için).
- better-sqlite3 native derlenmezse: derleme araçlarını kur (build-essential, python3),
  olmazsa 'node:sqlite' (Node 22+) veya 'sqlite3' paketine geç. Build'i baştan doğrula.
- Caddy/Nginx arkasında çalışacak: app.set('trust proxy', 1) EKLE.
  Yoksa secure cookie set edilmez ve giriş anında düşer.
- Cookie secure'ı ortama bağla: secure: process.env.NODE_ENV === 'production'.
  (Yerelde http://localhost ile test edebilelim diye.)
- express.json({ limit: '5mb' }) ayarla — state PUT için.
- Frontend'teki TÜM fetch çağrıları credentials:'same-origin' kullansın,
  yoksa oturum cookie'si sunucuya gitmez.
- known anahtarını "level|group|de" formatında üret (sadece "level|de" DEĞİL),
  çünkü aynı kelime farklı ünitelerde tekrar ediyor; ünite bazında ayrı sayılsın.
- a2.json boş ([]) → frontend "Bu seviye yakında" göstersin, çökmesin.
- Kaydı kısmak istersen: .env'de REGISTRATION_OPEN değişkeni olsun;
  false ise /api/register kapansın (kendi hesabını açınca kapatırsın).
- İki cihazda aynı anda çalışırsan last-write-wins olur (kişisel kullanımda sorun değil).