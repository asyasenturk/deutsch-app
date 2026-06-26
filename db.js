const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'app.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_state (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT    NOT NULL DEFAULT '{}',
    updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS eg_progress (
    user_id   INTEGER NOT NULL,
    word_key  TEXT    NOT NULL,
    known     INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER,
    PRIMARY KEY (user_id, word_key)
  );

  CREATE TABLE IF NOT EXISTS study_sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    date             TEXT    NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    words_learned    INTEGER DEFAULT 0,
    UNIQUE(user_id, date)
  );
`);

const stmts = {
  insertUser: db.prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)'
  ),
  insertEmptyState: db.prepare(
    "INSERT INTO user_state (user_id, data, updated_at) VALUES (?, '{}', datetime('now'))"
  ),
  findUserByName: db.prepare(
    'SELECT id, username, password_hash FROM users WHERE username = ?'
  ),
  findUserById: db.prepare(
    'SELECT id, username FROM users WHERE id = ?'
  ),
  getState: db.prepare(
    'SELECT data FROM user_state WHERE user_id = ?'
  ),
  upsertState: db.prepare(`
    INSERT INTO user_state (user_id, data, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `),
  getEgProgress: db.prepare(
    "SELECT word_key FROM eg_progress WHERE user_id = ? AND word_key LIKE ? AND known = 1"
  ),
  getAllEgProgress: db.prepare(
    "SELECT word_key FROM eg_progress WHERE user_id = ? AND known = 1"
  ),
  setEgProgress: db.prepare(`
    INSERT INTO eg_progress (user_id, word_key, known, last_seen)
    VALUES (?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(user_id, word_key) DO UPDATE SET
      known = excluded.known,
      last_seen = excluded.last_seen
  `),
  upsertStudySession: db.prepare(`
    INSERT INTO study_sessions (user_id, date, duration_seconds, words_learned)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      duration_seconds = duration_seconds + excluded.duration_seconds,
      words_learned    = words_learned    + excluded.words_learned
  `),
  getStudyToday: db.prepare(
    'SELECT duration_seconds, words_learned FROM study_sessions WHERE user_id = ? AND date = ?'
  ),
  getStudyWeekly: db.prepare(
    'SELECT date, duration_seconds, words_learned FROM study_sessions WHERE user_id = ? AND date >= ? ORDER BY date ASC'
  ),
};

function createUser(username, passwordHash) {
  const info = stmts.insertUser.run(username, passwordHash);
  const userId = Number(info.lastInsertRowid);
  stmts.insertEmptyState.run(userId);
  return { id: userId, username };
}

function findUserByName(username) {
  return stmts.findUserByName.get(username);
}

function findUserById(id) {
  return stmts.findUserById.get(id);
}

function getState(userId) {
  const row = stmts.getState.get(userId);
  if (!row) return {};
  try {
    return JSON.parse(row.data);
  } catch {
    return {};
  }
}

function saveState(userId, stateObj) {
  const json = JSON.stringify(stateObj);
  stmts.upsertState.run(userId, json);
}

function getEgProgress(userId, sublevel) {
  const rows = stmts.getEgProgress.all(userId, `${sublevel}|%`);
  return rows.map((r) => r.word_key);
}

function getAllEgProgress(userId) {
  return stmts.getAllEgProgress.all(userId).map(r => r.word_key);
}

function setEgProgress(userId, wordKey, known) {
  stmts.setEgProgress.run(userId, wordKey, known ? 1 : 0);
}

function upsertStudySession(userId, date, durSec, words) {
  stmts.upsertStudySession.run(userId, date, durSec, words);
}

function getStudyToday(userId, date) {
  return stmts.getStudyToday.get(userId, date);
}

function getStudyWeekly(userId, fromDate) {
  return stmts.getStudyWeekly.all(userId, fromDate);
}

module.exports = {
  db,
  DB_PATH,
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
};
