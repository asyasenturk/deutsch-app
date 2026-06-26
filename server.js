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
  getEgProgress,
  getAllEgProgress,
  setEgProgress,
  upsertStudySession,
  getStudyToday,
  getStudyWeekly,
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

// ─── EINFACH GUT ─────────────────────────────────────────────────────────────

const EG_SUBLEVELS = ['a1_1', 'a1_2', 'a2_1', 'a2_2', 'b1_1', 'b1_2'];
const EG_LABELS = { a1_1: 'A1.1', a1_2: 'A1.2', a2_1: 'A2.1', a2_2: 'A2.2', b1_1: 'B1.1', b1_2: 'B1.2' };

const EG_DATA = {};
for (const sl of EG_SUBLEVELS) {
  try {
    EG_DATA[sl] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `eg_${sl}.json`), 'utf8'));
  } catch {
    EG_DATA[sl] = [];
    console.warn(`EG data missing: eg_${sl}.json`);
  }
}

const EG_META = {};
for (const sl of EG_SUBLEVELS) {
  const seen = new Map();
  for (const entry of EG_DATA[sl]) {
    if (!entry.group) continue;
    seen.set(entry.group, (seen.get(entry.group) || 0) + 1);
  }
  EG_META[sl] = {
    label: EG_LABELS[sl],
    lektions: [...seen.entries()].map(([name, count]) => ({ name, count })),
  };
}

// ─── VERB DATA ────────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let inQuote = false, cur = '';
  for (const c of line) {
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

function deriveForms(ich) {
  const wir = ich.endsWith('e') ? ich + 'n' : ich + 'en';
  const du  = ich + 'st';
  const ihr = ich.endsWith('e') ? ich + 't' : ich + 't';
  return [ich, du, ich, wir, ihr, wir];
}

const VERBS = {};
try {
  const lines = fs.readFileSync(path.join(DATA_DIR, 'verbs.csv'), 'utf8').split('\n');
  lines.shift();
  for (const line of lines) {
    const cols = parseCSVLine(line.trim());
    if (cols.length < 10 || !cols[0]) continue;
    const [inf, prä_ich, prä_du, prä_er, prät_ich, part2, konj_ich, imp_sg, imp_pl, hilf] = cols;
    const prä_ihr = prä_du.endsWith('st') ? prä_du.slice(0, -2) + 't' : prä_du + 't';
    VERBS[inf.toLowerCase()] = {
      infinitiv: inf,
      hilfsverb: hilf.trim(),
      partizip2: part2,
      prasens:    [prä_ich, prä_du, prä_er, inf, prä_ihr, inf],
      prateritum: deriveForms(prät_ich),
      konjunktiv2: deriveForms(konj_ich),
      imperativ:  { singular: imp_sg, plural: imp_pl },
    };
  }
  console.log(`Verbs loaded: ${Object.keys(VERBS).length}`);
} catch (err) {
  console.error('verbs.csv load error:', err.message);
}

// ─── VOCAB (existing) ─────────────────────────────────────────────────────────

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

// ─── EINFACH GUT ENDPOINTS ───────────────────────────────────────────────────

app.get('/api/eg/meta', (_req, res) => {
  res.json(EG_META);
});

app.get('/api/eg/words', (req, res) => {
  const sl = req.query.sublevel;
  if (!EG_SUBLEVELS.includes(sl)) {
    return res.status(400).json({ error: 'Geçersiz sublevel.' });
  }
  const data = EG_DATA[sl];
  const lektionParam = req.query.lektion;

  if (lektionParam === 'all') {
    return res.json(data);
  }

  const idx = parseInt(lektionParam, 10);
  if (!Number.isInteger(idx) || idx < 1) {
    return res.status(400).json({ error: 'Geçersiz lektion parametresi.' });
  }
  const groups = [...new Map(data.filter(e => e.group).map(e => [e.group, true])).keys()];
  const target = groups[idx - 1];
  if (!target) {
    return res.status(400).json({ error: 'Bu lektion bulunamadı.' });
  }
  res.json(data.filter(e => e.group === target));
});

app.get('/api/eg/progress', requireAuth, (req, res) => {
  const sl = req.query.sublevel;
  if (sl === 'all') {
    return res.json({ known: getAllEgProgress(req.session.userId) });
  }
  if (!EG_SUBLEVELS.includes(sl)) {
    return res.status(400).json({ error: 'Geçersiz sublevel.' });
  }
  const known = getEgProgress(req.session.userId, sl);
  res.json({ known });
});

app.post('/api/eg/progress', requireAuth, (req, res) => {
  const { sublevel, word_key, known } = req.body || {};
  if (!EG_SUBLEVELS.includes(sublevel) || typeof word_key !== 'string' || !word_key) {
    return res.status(400).json({ error: 'Geçersiz istek gövdesi.' });
  }
  try {
    setEgProgress(req.session.userId, word_key, known ? 1 : 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('eg progress save error:', err);
    res.status(500).json({ error: 'Progress kaydedilemedi.' });
  }
});

// ─── STUDY SESSION ENDPOINTS ─────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

app.post('/api/session/ping', requireAuth, (req, res) => {
  const dur   = Math.max(0, Math.min(300, parseInt(req.body?.duration_seconds, 10) || 0));
  const words = Math.max(0, Math.min(500, parseInt(req.body?.words_learned,    10) || 0));
  if (dur === 0 && words === 0) return res.json({ ok: true });
  try {
    upsertStudySession(req.session.userId, todayISO(), dur, words);
    res.json({ ok: true });
  } catch (err) {
    console.error('session ping error:', err);
    res.status(500).json({ error: 'Kayıt hatası.' });
  }
});

app.get('/api/session/stats', requireAuth, (req, res) => {
  const today = todayISO();
  const d = new Date(); d.setDate(d.getDate() - 6);
  const weekStart = d.toISOString().slice(0, 10);
  try {
    const todayRow = getStudyToday(req.session.userId, today) || { duration_seconds: 0, words_learned: 0 };
    const weekly   = getStudyWeekly(req.session.userId, weekStart);
    res.json({ today_seconds: todayRow.duration_seconds, today_words: todayRow.words_learned, weekly });
  } catch (err) {
    console.error('session stats error:', err);
    res.status(500).json({ error: 'İstatistik alınamadı.' });
  }
});

// ─── VERB ENDPOINT ───────────────────────────────────────────────────────────

function normalizeUmlauts(s) {
  return s.replace(/oe/g, 'ö').replace(/ue/g, 'ü').replace(/ae/g, 'ä').replace(/ss/g, 'ß');
}

app.get('/api/verb', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) return res.status(400).json({ error: 'q parametresi gerekli.' });
  const verb = VERBS[q] || VERBS[normalizeUmlauts(q)];
  if (!verb) return res.json({ found: false });
  res.json({ found: true, ...verb });
});

// ─────────────────────────────────────────────────────────────────────────────

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
