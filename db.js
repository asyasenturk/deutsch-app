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

module.exports = {
  db,
  DB_PATH,
  createUser,
  findUserByName,
  findUserById,
  getState,
  saveState,
};
