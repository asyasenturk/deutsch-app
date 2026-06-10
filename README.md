# Deutsch App — Almanca Öğrenme Platformu (A1/A2/B1)

Node.js + Express + SQLite ile tek sunucuda çalışan, girişli, kullanıcıya özel ilerleme kaydeden Almanca kelime öğrenme uygulaması.

## Özellikler

- Kullanıcı kayıt / giriş (bcrypt + httpOnly oturum cookie)
- A1 / A2 / B1 seviyeleri, grup filtreleri
- Kelime kartları (çevir, ileri/geri, “Biliyorum / Tekrar et”, mobilde swipe)
- Quiz: çoktan seçmeli, DE→TR ve TR→DE, skor + üst üste doğru
- Tüm cihazlarda otomatik senkron — değişiklikte sunucuya yazılır, açılışta sunucudan yüklenir
- İlerleme çubuğu, “sadece bilmediklerim” filtresi, karıştır

## Yığın

- Node.js (>= 22.5) — yerleşik `node:sqlite` modülü kullanılır
- Express, `express-session` + `connect-sqlite3` (oturumlar diskte)
- `bcryptjs` (saf JS, kurulum için derleyici gerekmez)
- `express-rate-limit` (giriş/kayıt için dakikalık limit)

> Not: Spec'te `better-sqlite3` ve `bcrypt` öneriliyordu; bunlar Windows üzerinde C++ derleyicisi gerektirdiği için saf JS / yerleşik karşılıkları seçildi. Davranış ve veri modeli aynı.

## Kurulum

```bash
cd deutsch-app
npm install
cp .env.example .env
# .env içine güçlü bir SESSION_SECRET yaz, örn:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm start
```

Tarayıcıdan: <http://localhost:3000>

İlk açılışta `data/app.db` ve `data/sessions.db` otomatik oluşur.

## Ortam değişkenleri

| Değişken         | Açıklama                                              |
|------------------|-------------------------------------------------------|
| `SESSION_SECRET` | **Zorunlu.** Uzun rastgele bir dize.                  |
| `PORT`           | Varsayılan `3000`.                                    |
| `NODE_ENV`       | `production` olduğunda cookie `secure: true` olur.    |

## API uçları

| Yöntem | Yol                    | Açıklama                                          |
|--------|------------------------|---------------------------------------------------|
| POST   | `/api/register`        | `{ username, password }` — oluştur + oturum başlat |
| POST   | `/api/login`           | `{ username, password }`                          |
| POST   | `/api/logout`          | Oturumu kapat                                     |
| GET    | `/api/me`              | `{ username, state }` (oturum yoksa 401)          |
| PUT    | `/api/state`           | `{ data }` — kullanıcı state JSON'unu kaydet     |
| GET    | `/api/vocab/:level`    | `level ∈ a1, a2, b1` — kelime listesini döner    |

## HTTPS (Caddy)

`Caddyfile`:

```caddy
ogrenme.alanadin.com {
    reverse_proxy localhost:3000
}
```

```bash
caddy run        # ya da: sudo caddy start
```

Süreklilik için PM2 önerilir:

```bash
pm2 start server.js --name deutsch
pm2 save
```

## Yedekleme

SQLite tek dosya olduğu için tek satırlık yedek yeterli:

```bash
cp data/app.db backups/app_$(date +%F).db
```

Cron örneği (gece 03:00):

```cron
0 3 * * * cp /path/to/deutsch-app/data/app.db /path/to/backups/app_$(date +\%F).db
```

## Veri dosyaları

`data/a1.json`, `data/a2.json`, `data/b1.json` — değiştirilmez, API üzerinden okunur.

Format:

```json
[
  { "group": "İnsanlar", "de": "der Mann", "tr": "adam, erkek", "ex": "Der Mann ist groß." }
]
```

## Güvenlik notları

- Şifreler **bcrypt** ile hash'lenir (cost 12), düz metin saklanmaz.
- `password_hash` hiçbir API yanıtında dönmez.
- Oturum cookie: `httpOnly`, `sameSite=lax`, prod'da `secure`.
- Tüm SQL prepared statement ile çalışır.
- `/api/login` ve `/api/register` 5 dk'da en fazla 20 deneme.
- 5MB üstü istek gövdeleri reddedilir.
