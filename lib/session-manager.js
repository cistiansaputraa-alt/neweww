const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const SESSIONS_DB = path.join(__dirname, '..', 'database', 'sessions.json');

const liveSockets = {};

function ensureDirs() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function loadSessions() {
  try {
    const raw = fs.readFileSync(SESSIONS_DB, 'utf8');
    return raw.trim() ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(data) {
  fs.writeFileSync(SESSIONS_DB, JSON.stringify(data, null, 2));
}

function sessionPath(owner, phone) {
  const p = path.join(SESSIONS_DIR, owner, phone);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function getSessionsByOwner(owner) {
  return loadSessions().filter(s => s.owner === owner);
}

function getGlobalSessions() {
  return loadSessions().filter(s => s.type === 'global');
}

async function connectSession(owner, phone, type = 'private', order = 1) {
  ensureDirs();
  const key = `${owner}:${phone}`;
  if (liveSockets[key]) return liveSockets[key];

  const dir = sessionPath(owner, phone);
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    getMessage: async () => ({ conversation: 'R' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') {
      updateSession(key, { active: true, lastConnect: Date.now() });
    }
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      updateSession(key, { active: false });
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          delete liveSockets[key];
          connectSession(owner, phone, type, order);
        }, 5000);
      } else {
        delete liveSockets[key];
        trySwitchBackup(owner);
      }
    }
  });

  liveSockets[key] = sock;
  return sock;
}

function updateSession(key, patch) {
  const [owner, phone] = key.split(':');
  const sessions = loadSessions();
  const s = sessions.find(x => x.owner === owner && x.phone === phone);
  if (s) {
    Object.assign(s, patch);
    saveSessions(sessions);
  }
}

async function requestPairing(owner, phone, type = 'private', order = 1) {
  ensureDirs();
  const dir = sessionPath(owner, phone);
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    getMessage: async () => ({ conversation: 'R' })
  });

  sock.ev.on('creds.update', saveCreds);
  const code = await sock.requestPairingCode(phone);

  sock.ev.on('connection.update', (u) => {
    const { connection } = u;
    if (connection === 'open') {
      const sessions = loadSessions();
      const exist = sessions.find(s => s.owner === owner && s.phone === phone);
      if (!exist) {
        sessions.push({
          owner, phone, type, order, active: true, created: Date.now(), lastConnect: Date.now()
        });
        saveSessions(sessions);
      } else {
        exist.active = true;
        exist.type = type;
        exist.lastConnect = Date.now();
        saveSessions(sessions);
      }
      liveSockets[`${owner}:${phone}`] = sock;
    }
  });

  return { sock, code };
}

async function trySwitchBackup(owner) {
  const sessions = getSessionsByOwner(owner);
  if (sessions.length < 2) return;
  const backup = sessions.sort((a, b) => a.order - b.order)[1];
  if (!backup) return;
  await connectSession(owner, backup.phone, backup.type, backup.order);
}

function getActiveSocket(owner) {
  const sessions = getSessionsByOwner(owner);
  for (const s of sessions) {
    const key = `${s.owner}:${s.phone}`;
    if (liveSockets[key] && s.active) return liveSockets[key];
  }
  for (const k of Object.keys(liveSockets)) {
    if (k.startsWith(owner + ':')) return liveSockets[k];
  }
  return null;
}

function getGlobalSocket() {
  const globalSessions = getGlobalSessions();
  for (const s of globalSessions) {
    const key = `${s.owner}:${s.phone}`;
    if (liveSockets[key] && s.active) return liveSockets[key];
  }
  return null;
}

function deleteSession(owner, phone) {
  const key = `${owner}:${phone}`;
  if (liveSockets[key]) {
    try { liveSockets[key].end(); } catch {}
    delete liveSockets[key];
  }
  const sessions = loadSessions().filter(s => !(s.owner === owner && s.phone === phone));
  saveSessions(sessions);
  const dir = path.join(SESSIONS_DIR, owner, phone);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = {
  connectSession,
  requestPairing,
  getActiveSocket,
  getGlobalSocket,
  getSessionsByOwner,
  getGlobalSessions,
  deleteSession,
  trySwitchBackup,
  liveSockets
};