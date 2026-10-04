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

// liveSockets = {
//   "vip1:628123456789": socketInstance
// }
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

function getSession(owner, phone) {
  return loadSessions().find(s => s.owner === owner && s.phone === phone);
}

function getSessionByJid(jid) {
  return loadSessions().find(s => s.senderJid === jid);
}

function getAllSessions() {
  return loadSessions();
}

function getGlobalSessions() {
  return loadSessions().filter(s => s.type === 'global');
}

function getConnectedSessions() {
  const live = Object.keys(liveSockets);
  return loadSessions().filter(s => live.includes(`${s.owner}:${s.phone}`));
}

// ============================================
// CONNECT SESSION (dari pairing yang sudah ada)
// ============================================
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
      console.log(`[SESSION] ✅ ${key} connected`);
      updateSession(owner, phone, { connected: true, lastConnect: Date.now() });
    }
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`[SESSION] ❌ ${key} closed, code: ${code}`);
      updateSession(owner, phone, { connected: false });
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          delete liveSockets[key];
          connectSession(owner, phone, type, order);
        }, 5000);
      } else {
        delete liveSockets[key];
        console.log(`[SESSION] Nomor ${phone} logged out`);
      }
    }
  });

  liveSockets[key] = sock;
  return sock;
}

// ============================================
// PAIRING BARU (bikin session baru)
// ============================================
async function requestPairing(owner, phone, type = 'private', roleOwner = 'buyer') {
  ensureDirs();
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const dir = sessionPath(owner, cleanPhone);
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
  const code = await sock.requestPairingCode(cleanPhone);

  sock.ev.on('connection.update', (u) => {
    const { connection } = u;
    if (connection === 'open') {
      console.log(`[PAIRING] ✅ ${owner}:${cleanPhone} berhasil pairing`);
      const sessions = loadSessions();
      const exist = sessions.find(s => s.owner === owner && s.phone === cleanPhone);
      const senderJid = cleanPhone + '@s.whatsapp.net';
      
      if (!exist) {
        const order = sessions.filter(s => s.owner === owner).length + 1;
        sessions.push({
          owner,
          phone: cleanPhone,
          senderJid,
          type,
          order,
          active: true,
          connected: true,
          assignedTo: [],
          created: Date.now(),
          lastConnect: Date.now(),
          roleOwner
        });
        saveSessions(sessions);
      } else {
        exist.connected = true;
        exist.lastConnect = Date.now();
        exist.senderJid = senderJid;
        saveSessions(sessions);
      }
      liveSockets[`${owner}:${cleanPhone}`] = sock;
    }
  });

  return { sock, code, phone: cleanPhone };
}

// ============================================
// UPDATE SESSION DATA
// ============================================
function updateSession(owner, phone, patch) {
  const sessions = loadSessions();
  const s = sessions.find(x => x.owner === owner && x.phone === phone);
  if (s) {
    Object.assign(s, patch);
    saveSessions(sessions);
  }
}

// ============================================
// ASSIGN SESSION KE BUYER/VIP
// (reseller assign session-nya ke VIP/buyer)
// ============================================
function assignSessionToBuyer(ownerPhoneOwner, phone, targetUsername) {
  const sessions = loadSessions();
  const s = sessions.find(x => x.owner === ownerPhoneOwner && x.phone === phone);
  if (!s) return false;
  if (!s.assignedTo) s.assignedTo = [];
  if (!s.assignedTo.includes(targetUsername)) {
    s.assignedTo.push(targetUsername);
  }
  saveSessions(sessions);
  return true;
}

function unassignSessionFromBuyer(ownerPhoneOwner, phone, targetUsername) {
  const sessions = loadSessions();
  const s = sessions.find(x => x.owner === ownerPhoneOwner && x.phone === phone);
  if (!s || !s.assignedTo) return false;
  s.assignedTo = s.assignedTo.filter(u => u !== targetUsername);
  saveSessions(sessions);
  return true;
}

// ============================================
// GET SENDER YANG BISA DIPAKAI USER
// ============================================
function getAvailableSendersForUser(username, role) {
  const allSessions = loadSessions();
  const result = {
    private: [],   // session milik sendiri
    global: [],    // session global (dari role di atas)
    assigned: []   // session yang di-assign ke user ini
  };

  for (const s of allSessions) {
    if (!s.senderJid) continue;

    // Private: session milik sendiri
    if (s.owner === username) {
      result.private.push(s);
      continue;
    }

    // Global: session tipe global, owner role di atas buyer
    if (s.type === 'global') {
      // VIP & buyer nggak bisa pakai global
      if (role === 'VIP' || role === 'buyer') continue;
      result.global.push(s);
      continue;
    }

    // Assigned: session yang di-assign ke user ini
    if (s.assignedTo && s.assignedTo.includes(username)) {
      result.assigned.push(s);
      continue;
    }
  }

  return result;
}

// ============================================
// CARI SOCKET BERDASARKAN SENDER JID
// ============================================
function getSocketBySenderJid(senderJid) {
  for (const key of Object.keys(liveSockets)) {
    const [owner, phone] = key.split(':');
    if (senderJid === phone + '@s.whatsapp.net') {
      return liveSockets[key];
    }
  }
  return null;
}

// ============================================
// GET SOCKET UNTUK USER (fallback: private → global)
// ============================================
function getActiveSocket(owner) {
  const sessions = getSessionsByOwner(owner);
  for (const s of sessions) {
    const key = `${s.owner}:${s.phone}`;
    if (liveSockets[key] && s.connected) return liveSockets[key];
  }
  for (const k of Object.keys(liveSockets)) {
    if (k.startsWith(owner + ':')) return liveSockets[k];
  }
  return null;
}

// ============================================
// DELETE SESSION
// ============================================
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

// ============================================
// COUNT SESSION AKTIF PER OWNER
// ============================================
function countSessionsByOwner(owner) {
  return loadSessions().filter(s => s.owner === owner).length;
}

module.exports = {
  connectSession,
  requestPairing,
  updateSession,
  getSessionsByOwner,
  getSession,
  getSessionByJid,
  getAllSessions,
  getGlobalSessions,
  getConnectedSessions,
  getAvailableSendersForUser,
  getSocketBySenderJid,
  getActiveSocket,
  assignSessionToBuyer,
  unassignSessionFromBuyer,
  deleteSession,
  countSessionsByOwner,
  liveSockets
};