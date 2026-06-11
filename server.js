require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const {
  createUser,
  findUserByName,
  findUserById,
  getState,
  saveState,
} = require('./db');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const IS_PROD = process.env.NODE_ENV === 'production';
const REGISTRATION_OPEN = String(process.env.REGISTRATION_OPEN || 'true').toLowerCase() === 'true';

if (!SESSION_SECRET) {
  console.error('HATA: SESSION_SECRET tanımlı değil. .env dosyasına ekleyin.');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const VALID_LEVELS = new Set(['a1', 'a2', 'b1']);

const app = express();
app.set('trust proxy', 1);
app.disable('etag');

app.use(express.json({ limit: '5mb' }));

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'deutsch.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla deneme. Lütfen birkaç dakika sonra tekrar deneyin.' },
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Oturum yok.' });
  }
  next();
}

function validateCredentials(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (username.length < 3 || username.length > 30) {
    return { ok: false, error: 'Kullanıcı adı 3–30 karakter olmalı.' };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return { ok: false, error: 'Kullanıcı adı sadece harf, rakam, _ . - içerebilir.' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Şifre en az 6 karakter olmalı.' };
  }
  return { ok: true, username, password };
}

app.post('/api/register', authLimiter, async (req, res) => {
  if (!REGISTRATION_OPEN) {
    return res.status(403).json({ error: 'Kayıt şu an kapalı.' });
  }
  const v = validateCredentials(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });

  if (findUserByName(v.username)) {
    return res.status(409).json({ error: 'Bu kullanıcı adı zaten kayıtlı.' });
  }

  try {
    const hash = await bcrypt.hash(v.password, 12);
    const user = createUser(v.username, hash);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ username: user.username });
  } catch (err) {
    console.error('register error:', err);
    if (String(err?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu kullanıcı adı zaten kayıtlı.' });
    }
    res.status(500).json({ error: 'Kayıt sırasında hata oluştu.' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const v = validateCredentials(req.body);
  if (!v.ok) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }

  const user = findUserByName(v.username);
  if (!user) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }

  const ok = await bcrypt.compare(v.password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('deutsch.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Oturum geçersiz.' });
  }
  const state = getState(user.id);
  res.json({ username: user.username, state });
});

app.put('/api/state', requireAuth, (req, res) => {
  const data = req.body?.data;
  if (data === undefined || data === null || typeof data !== 'object') {
    return res.status(400).json({ error: 'Geçersiz state.' });
  }
  try {
    saveState(req.session.userId, data);
    res.json({ ok: true });
  } catch (err) {
    console.error('state save error:', err);
    res.status(500).json({ error: 'State kaydedilemedi.' });
  }
});

const vocabCache = new Map();
function loadVocab(level) {
  if (vocabCache.has(level)) return vocabCache.get(level);
  const filePath = path.join(DATA_DIR, `${level}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    vocabCache.set(level, parsed);
    return parsed;
  } catch (err) {
    console.error(`vocab parse error for ${level}:`, err);
    return null;
  }
}

app.get('/api/config', (_req, res) => {
  res.json({ registrationOpen: REGISTRATION_OPEN });
});

app.get('/api/vocab/:level', (req, res) => {
  const level = String(req.params.level || '').toLowerCase();
  if (!VALID_LEVELS.has(level)) {
    return res.status(404).json({ error: 'Geçersiz seviye.' });
  }
  const list = loadVocab(level);
  if (list === null) {
    return res.status(404).json({ error: 'Seviye verisi bulunamadı.' });
  }
  res.json(list);
});

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.use((err, _req, res, _next) => {
  console.error('unhandled error:', err);
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'İstek gövdesi çok büyük.' });
  }
  res.status(500).json({ error: 'Sunucu hatası.' });
});

app.listen(PORT, () => {
  console.log(`Deutsch app http://localhost:${PORT} adresinde çalışıyor.`);
});
