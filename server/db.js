// Persistência simples em arquivo JSON. Suficiente para uma aplicação de
// amigos/salas de uso pessoal, sem depender de módulos nativos (better-sqlite3
// etc.) que exigem compilação.
const fs = require('fs');
const path = require('path');

// Em hospedagens com disco persistente (ex.: Render), aponte DATA_DIR para o
// caminho do disco montado (ex.: /var/data) via variável de ambiente. Sem
// disco persistente, os dados são perdidos a cada novo deploy/reinício.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function emptyState() {
  return {
    users: {}, // id (uuid) -> { id, username, usernameLower, passwordHash, createdAt,
               //                displayName, hasAvatar, avatarVersion, avatarMimeType }
    friendRequests: {}, // id -> { id, from, to, status, createdAt }
    friends: {}, // userId -> [friendId, ...]
    rooms: {}, // id (uuid) -> { id, name, ownerId, memberIds: [...], createdAt }
  };
}

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyState();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch (err) {
    console.error('[db] Falha ao ler banco de dados, iniciando vazio:', err.message);
    return emptyState();
  }
}

const state = load();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[db] Falha ao salvar banco de dados:', err.message);
  }
}

module.exports = { state, persist, DATA_DIR };
