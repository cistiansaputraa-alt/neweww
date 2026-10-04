// ============================================
// RAFAEL APPS v2.0 — FULL FIXED
// ============================================
console.log('🚀 Memulai Rafael Apps v2.0...');

const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const archiver = require('archiver');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const config = require('./config');
const bugFunctions = require('./lib/bug-functions');
const roleMgr = require('./lib/role-manager');
const sessionMgr = require('./lib/session-manager');

const bot = new Telegraf(config.telegramBotToken);
const app = express();
app.use(require('cors')());

const OWNER_ID = config.ownerId.toString();
const userDBPath = path.join(__dirname, 'database', 'users.json');
const ckeyDB = path.join(__dirname, 'database', 'keyapk.json');
const REF_FILE = path.join(__dirname, 'database', 'referral.json');
const senderDB = path.join(__dirname, 'database', 'senders.json');

// ========== INIT FILES ==========
function ensureFile(p, c) {
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(p)) fs.writeFileSync(p, c);
}
ensureFile(userDBPath, '[]');
ensureFile(ckeyDB, '[]');
ensureFile(REF_FILE, '{}');
ensureFile(senderDB, '[]');

function readJSON(p, f) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return raw.trim() ? JSON.parse(raw) : f;
  } catch { return f; }
}
function writeJSON(p, d) {
  try { fs.writeFileSync(p, JSON.stringify(d, null, 2)); } catch {}
}

const loadCKeyUsers = () => { const d = readJSON(ckeyDB, []); return Array.isArray(d) ? d : []; };
const saveCKeyUsers = (d) => writeJSON(ckeyDB, d);
const loadSenders = () => { const d = readJSON(senderDB, []); return Array.isArray(d) ? d : []; };
const saveSenders = (d) => writeJSON(senderDB, d);
const loadUsers = () => { const d = readJSON(userDBPath, []); return Array.isArray(d) ? d : []; };
const saveUsers = (d) => writeJSON(userDBPath, d);
const loadRefs = () => readJSON(REF_FILE, {});
const saveRefs = (d) => writeJSON(REF_FILE, d);

function formatWIB(ts) {
  const f = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = f.formatToParts(ts);
  const g = (t) => p.find(x => x.type === t)?.value || '';
  return `${g('day')}-${g('month')}-${g('year')} ${g('hour')}:${g('minute')}:${g('second')} WIB`;
}

function getUptime() {
  const s = process.uptime();
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${Math.floor(s%60)}s`;
}

// ========== AUTO BACKUP (6 JAM SEKALI) ==========
let backupRunning = false;
async function autoBackup() {
  if (backupRunning) return;
  backupRunning = true;
  try {
    const dir = path.join(__dirname, 'backup');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const zipPath = path.join(dir, `backup-${ts}.zip`);
    const out = fs.createWriteStream(zipPath);
    const arc = archiver('zip', { zlib: { level: 9 } });
    arc.pipe(out);
    for (const item of ['database', 'rafael.js', 'config.js', 'package.json', 'lib']) {
      const p = path.join(__dirname, item);
      if (fs.existsSync(p)) {
        if (fs.lstatSync(p).isDirectory()) arc.directory(p, item);
        else arc.file(p, { name: item });
      }
    }
    await arc.finalize();
    out.on('close', async () => {
      try {
        await bot.telegram.sendDocument(config.ownerId,
          { source: zipPath },
          { caption: `📦 <b>Backup Rafael Apps</b>\n📅 ${new Date().toLocaleString('id-ID')}\n💾 ${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB`,
            parse_mode: 'HTML' });
        fs.unlinkSync(zipPath);
      } catch (e) {
        console.error('Backup kirim error:', e.message);
      }
    });
  } catch (e) {
    console.error('Backup error:', e.message);
  }
  backupRunning = false;
}

// ========== CLEANUP ==========
const GRACE_PERIOD = 1 * 24 * 60 * 60 * 1000;
const NOTIF_BEFORE = 24 * 60 * 60 * 1000;

async function cleanupExpired() {
  try {
    const users = loadCKeyUsers();
    const now = Date.now();
    const active = [];
    const deletedList = [];
    for (const u of users) {
      const sisa = u.expired - now;
      if (sisa < -GRACE_PERIOD) {
        try {
          const sessions = sessionMgr.getSessionsByOwner(u.username);
          for (const s of sessions) sessionMgr.deleteSession(u.username, s.phone);
        } catch {}
        try { roleMgr.removeBuyer(u.username); } catch {}
        deletedList.push(u.username);
      } else {
        active.push(u);
      }
    }
    if (deletedList.length > 0) {
      saveCKeyUsers(active);
      try {
        await bot.telegram.sendMessage(config.ownerId,
          `🧹 <b>Auto-Cleanup</b>\n\n${deletedList.length} akun expired dihapus:\n<code>${deletedList.join('\n')}</code>`,
          { parse_mode: 'HTML' });
      } catch {}
    }
  } catch (e) {}
}

async function notifyExpiringSoon() {
  try {
    const users = loadCKeyUsers();
    const now = Date.now();
    let updated = false;
    for (const u of users) {
      const sisa = u.expired - now;
      if (sisa > 0 && sisa < NOTIF_BEFORE && !u.notifiedExpiring) {
        try {
          await bot.telegram.sendMessage(config.ownerId,
            `⚠️ <b>Akun Akan Expired</b>\n\n👤 ${u.username}\n🎖️ ${u.role}\n⏳ ${Math.round(sisa/3600000)} jam lagi\n📅 ${formatWIB(u.expired)}`,
            { parse_mode: 'HTML' });
          u.notifiedExpiring = true;
          updated = true;
        } catch {}
      }
      if (sisa > NOTIF_BEFORE && u.notifiedExpiring) {
        u.notifiedExpiring = false;
        updated = true;
      }
    }
    if (updated) saveCKeyUsers(users);
  } catch (e) {}
}

async function cleanupDeadSessions() {
  try {
    const sessionsPath = path.join(__dirname, 'database', 'sessions.json');
    if (!fs.existsSync(sessionsPath)) return;
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
    const live = Object.keys(sessionMgr.liveSockets);
    const now = Date.now();
    const keep = [];
    let deleted = 0;
    for (const s of sessions) {
      const key = `${s.owner}:${s.phone}`;
      const isLive = live.includes(key);
      const lastConnect = s.lastConnect || s.created || 0;
      const isOld = now - lastConnect > 7 * 86400000;
      if (!isLive && isOld) {
        try { sessionMgr.deleteSession(s.owner, s.phone); deleted++; } catch {}
      } else keep.push(s);
    }
    if (deleted > 0) fs.writeFileSync(sessionsPath, JSON.stringify(keep, null, 2));
  } catch (e) {}
}

// ============================================
// MIDDLEWARE: CEK AKSES TELEGRAM
// ============================================
async function checkTelegramAccess(ctx, next) {
  const userId = ctx.from.id.toString();
  if (userId === OWNER_ID) return next();
  const role = roleMgr.getRoleByTelegramId(userId);
  if (!role || !roleMgr.canAccessTelegram(role)) {
    return ctx.replyWithHTML(
      `<blockquote>🚫 <b>Akses Ditolak</b>\n\nBot ini hanya untuk <b>Reseller ke atas</b>.\n\nRole kamu: <b>${role || 'Tidak Terdaftar'}</b>\n\nHubungi owner untuk upgrade akses.</blockquote>`,
      { reply_markup: { inline_keyboard: [[{ text: '💬 Hubungi Owner', url: `https://t.me/${config.usernameOwner.replace('@', '')}` }]] } }
    );
  }
  await next();
}

// ============================================
// TELEGRAM: /start
// ============================================
bot.command('start', checkTelegramAccess, async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const role = userId === OWNER_ID ? 'developer' : roleMgr.getRoleByTelegramId(userId) || 'unknown';

    const caption = `<blockquote>🚀 <b>RAFAEL APPS</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Nama:</b> ${userName}
🆔 <b>ID:</b> <code>${userId}</code>
🎖️ <b>Role:</b> ${role}
⏱️ <b>Uptime:</b> ${getUptime()}
━━━━━━━━━━━━━━━━━━━━
🌐 <b>Panel:</b> ${config.ipVps}
━━━━━━━━━━━━━━━━━━━━</blockquote>

<i>Powered by ${config.settings.footer}</i>`;

    const keyboard = Markup.inlineKeyboard([
      [
        { text: '📊 Cek Akun', callback_data: 'tg_check' },
        { text: '➕ Buat CKey', callback_data: 'tg_ckey' }
      ],
      [
        { text: '📋 List Akun', callback_data: 'tg_list' },
        { text: '🌐 Buka Panel', url: config.ipVps }
      ],
      [
        { text: '💬 Owner', url: `https://t.me/${config.usernameOwner.replace('@', '')}` }
      ]
    ]);

    try {
      await ctx.replyWithPhoto(
        { url: config.telegramMedia.startPhoto },
        { caption, parse_mode: 'HTML', ...keyboard }
      );
    } catch (e) {
      console.error('Kirim foto gagal:', e.message);
      await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (e) {
    console.error('/start error:', e.message);
    await ctx.reply('❌ Error: ' + e.message);
  }
});

// Menu: Cek Akun
bot.action('tg_check', checkTelegramAccess, async (ctx) => {
  try { await ctx.deleteMessage(); } catch {}
  const userId = ctx.from.id.toString();
  const role = userId === OWNER_ID ? 'developer' : roleMgr.getRoleByTelegramId(userId) || 'unknown';

  const caption = `<blockquote>📊 <b>INFO AKUN ANDA</b>
━━━━━━━━━━━━━━━━━━━━
🆔 <b>Telegram ID:</b> <code>${userId}</code>
🎖️ <b>Role:</b> ${role}
━━━━━━━━━━━━━━━━━━━━</blockquote>`;

  await ctx.replyWithHTML(caption, {
    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'tg_home' }]] }
  });
});

// Menu: CKey
bot.action('tg_ckey', checkTelegramAccess, async (ctx) => {
  try { await ctx.deleteMessage(); } catch {}
  if (ctx.from.id.toString() !== OWNER_ID) {
    return ctx.replyWithHTML('<blockquote>🚫 Hanya owner yang bisa buat CKey.</blockquote>', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'tg_home' }]] }
    });
  }

  const caption = `<blockquote>➕ <b>BUAT CKEY</b>
━━━━━━━━━━━━━━━━━━━━
Format:
<code>/ckey nama,30d,role,PASSWORD</code>

<b>Contoh:</b>
<code>/ckey rafael,30d,admin,RAHASIA123</code>

<b>Role tersedia:</b>
developer, owner, admin, partner, moderator, reseller, VIP, buyer
━━━━━━━━━━━━━━━━━━━━</blockquote>`;

  await ctx.replyWithHTML(caption, {
    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'tg_home' }]] }
  });
});

// Menu: List Akun
bot.action('tg_list', checkTelegramAccess, async (ctx) => {
  try { await ctx.deleteMessage(); } catch {}
  const users = loadCKeyUsers();
  if (users.length === 0) {
    return ctx.replyWithHTML('<blockquote>📭 Belum ada akun terdaftar.</blockquote>', {
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'tg_home' }]] }
    });
  }

  const now = Date.now();
  const active = users.filter(u => u.expired > now).length;
  const expired = users.length - active;

  const caption = `<blockquote>📋 <b>DAFTAR AKUN RAFAEL APPS</b>
━━━━━━━━━━━━━━━━━━━━
👥 <b>Total Akun:</b> ${users.length}
✅ <b>Aktif:</b> ${active}
❌ <b>Expired:</b> ${expired}
━━━━━━━━━━━━━━━━━━━━

${users.slice(0, 10).map((u, i) =>
  `${i+1}. <b>${u.username}</b> (${u.role})\n   Exp: ${formatWIB(u.expired)}`
).join('\n')}

${users.length > 10 ? `\n<i>... dan ${users.length - 10} akun lainnya</i>` : ''}
━━━━━━━━━━━━━━━━━━━━</blockquote>`;

  await ctx.replyWithHTML(caption, {
    reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'tg_home' }]] }
  });
});

// Menu: Home
bot.action('tg_home', checkTelegramAccess, async (ctx) => {
  try { await ctx.deleteMessage(); } catch {}
  const userId = ctx.from.id.toString();
  const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const role = userId === OWNER_ID ? 'developer' : roleMgr.getRoleByTelegramId(userId) || 'unknown';

  const caption = `<blockquote>🚀 <b>RAFAEL APPS</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Nama:</b> ${userName}
🆔 <b>ID:</b> <code>${userId}</code>
🎖️ <b>Role:</b> ${role}
⏱️ <b>Uptime:</b> ${getUptime()}
━━━━━━━━━━━━━━━━━━━━</blockquote>

<i>Powered by ${config.settings.footer}</i>`;

  const keyboard = Markup.inlineKeyboard([
    [
      { text: '📊 Cek Akun', callback_data: 'tg_check' },
      { text: '➕ Buat CKey', callback_data: 'tg_ckey' }
    ],
    [
      { text: '📋 List Akun', callback_data: 'tg_list' },
      { text: '🌐 Buka Panel', url: config.ipVps }
    ],
    [
      { text: '💬 Owner', url: `https://t.me/${config.usernameOwner.replace('@', '')}` }
    ]
  ]);

  try {
    await ctx.replyWithPhoto(
      { url: config.telegramMedia.menuPhoto },
      { caption, parse_mode: 'HTML', ...keyboard }
    );
  } catch (e) {
    await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
  }
});

// /ckey
bot.command('ckey', async (ctx) => {
  try {
    if (ctx.from.id.toString() !== OWNER_ID) return ctx.reply('🚫 Khusus Owner!');
    const args = ctx.message.text.split(' ').slice(1).join(' ');
    if (!args) {
      return ctx.replyWithHTML(`<blockquote>📌 <b>Format:</b>
<code>/ckey nama,30d,role,PASSWORD</code>

<b>Role:</b> developer, owner, admin, partner, moderator, reseller, VIP, buyer</blockquote>`);
    }

    const [nama, durasi, role = 'buyer', pw] = args.split(',');
    if (!nama || !durasi || !durasi.endsWith('d')) return ctx.reply('❌ Format salah');
    const hari = parseInt(durasi);
    if (isNaN(hari)) return ctx.reply('❌ Durasi harus angka');
    if (!config.roleOrder.includes(role)) return ctx.reply(`❌ Role invalid. Pilih: ${config.roleOrder.join(', ')}`);

    let password = pw ? pw.toUpperCase() :
      [...Array(8)].map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random()*26)]).join('');

    const expired = Date.now() + hari * 86400000;
    const users = loadCKeyUsers();
    if (users.find(u => u.username === nama)) return ctx.reply('⚠️ Username sudah ada!');

    users.push({
      username: nama, key: password, expired, role, senders: [],
      telegramId: null
    });
    saveCKeyUsers(users);

    await ctx.replyWithHTML(`<blockquote>✅ <b>AKUN RAFAEL APPS DIBUAT</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Username:</b> <code>${nama}</code>
🔑 <b>Key:</b> <code>${password}</code>
🎖️ <b>Role:</b> ${role}
⏳ <b>Aktif:</b> ${hari} hari
📅 <b>Expired:</b> ${formatWIB(expired)}
━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━</blockquote>`);
  } catch (e) { ctx.reply('❌ ' + e.message); }
});

// /extend
bot.command('extend', async (ctx) => {
  try {
    if (ctx.from.id.toString() !== OWNER_ID) return ctx.reply('🚫 Khusus Owner!');
    const args = ctx.message.text.split(' ').slice(1).join(' ');
    if (!args) return ctx.replyWithHTML(`<blockquote>📌 <b>Format:</b>
<code>/extend username,30d</code></blockquote>`);

    const [username, durasi] = args.split(',');
    if (!username || !durasi || !durasi.endsWith('d')) return ctx.reply('❌ Format salah!');
    const hari = parseInt(durasi.replace('d', ''));
    if (isNaN(hari)) return ctx.reply('❌ Durasi harus angka!');

    const users = loadCKeyUsers();
    const user = users.find(u => u.username === username);
    if (!user) return ctx.reply(`❌ Username "${username}" tidak ditemukan!`);

    const now = Date.now();
    const base = user.expired > now ? user.expired : now;
    const newExpired = base + hari * 86400000;
    user.expired = newExpired;
    user.notifiedExpiring = false;
    saveCKeyUsers(users);

    await ctx.replyWithHTML(`<blockquote>✅ <b>AKUN DIPERPANJANG</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Username:</b> ${username}
🎖️ <b>Role:</b> ${user.role}
➕ <b>Tambahan:</b> ${hari} hari
📅 <b>Expired Baru:</b> ${formatWIB(newExpired)}
━━━━━━━━━━━━━━━━━━━━</blockquote>`);
  } catch (e) { ctx.reply('❌ ' + e.message); }
});

// /help
bot.command('help', checkTelegramAccess, async (ctx) => {
  await ctx.replyWithHTML(`<blockquote>📖 <b>BANTUAN RAFAEL APPS</b>
━━━━━━━━━━━━━━━━━━━━
<b>Command tersedia:</b>

/start — Menu utama
/help — Bantuan
/ckey — Buat akun (owner)
/extend — Perpanjang akun (owner)

<b>Panel:</b> ${config.ipVps}
━━━━━━━━━━━━━━━━━━━━</blockquote>`);
});

// ============================================
// WEB PANEL
// ============================================
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

const loginFile = path.join(__dirname, 'RAFAEL', 'Login.html');
const panelFile = path.join(__dirname, 'RAFAEL', 'Rafael.html');
const loadingFile = path.join(__dirname, 'RAFAEL', 'Loading.html');

app.get('/', (req, res) => res.sendFile(loginFile));
app.get('/login', (req, res) => res.sendFile(loginFile));

app.get('/logout', (req, res) => {
  res.clearCookie('sessionUser');
  res.redirect('/login');
});

app.get('/loading', (req, res) => {
  const u = req.cookies.sessionUser;
  if (!u) return res.redirect('/login');
  const user = loadCKeyUsers().find(x => x.username === u);
  if (!user || Date.now() > user.expired) return res.redirect('/login');
  res.sendFile(loadingFile);
});

app.get('/panel', (req, res) => {
  const u = req.cookies.sessionUser;
  if (!u) return res.sendFile(loginFile);
  const user = loadCKeyUsers().find(x => x.username === u);
  if (!user || Date.now() > user.expired) return res.sendFile(loginFile);
  res.sendFile(panelFile);
});

app.post('/auth', (req, res) => {
  const { username, key } = req.body;
  const user = loadCKeyUsers().find(u => u.username === username);
  if (!user) return res.redirect('/login?msg=' + encodeURIComponent('Username tidak ditemukan!'));
  if (user.key !== key) return res.redirect('/login?msg=' + encodeURIComponent('Key salah!'));
  if (Date.now() > user.expired) return res.redirect('/login?msg=' + encodeURIComponent('Akun expired!'));
  res.cookie('sessionUser', username, { maxAge: 3600000 });
  res.redirect('/loading');
});

function requireLogin(req, res, next) {
  const u = req.cookies.sessionUser;
  if (!u) return res.status(401).json({ error: 'Not authenticated' });
  const user = loadCKeyUsers().find(x => x.username === u);
  if (!user || Date.now() > user.expired) return res.status(401).json({ error: 'Session expired' });
  req.user = user;
  next();
}

// API: USER
app.get('/api/user', requireLogin, (req, res) => {
  const u = req.user;
  const role = u.role || 'buyer';
  res.json({
    username: u.username,
    role,
    expired: u.expired,
    expiredFormatted: formatWIB(u.expired),
    senderLimit: roleMgr.getSenderLimit(role),
    pairingLimit: roleMgr.getPairingLimit(role),
    canPairGlobal: roleMgr.canPairGlobal(role),
    canAddGlobalSender: roleMgr.canAddGlobalSender(role),
    canBugVIP: roleMgr.canAccess(role, 'bugVIP'),
    canManageBuyer: roleMgr.canAccess(role, 'manageBuyer'),
    media: config.media,
    cooldown: config.cooldown
  });
});

// API: SESSIONS
app.get('/api/sessions', requireLogin, (req, res) => {
  const list = sessionMgr.getSessionsByOwner(req.user.username);
  res.json({ sessions: list });
});

app.post('/api/sessions/pair', requireLogin, async (req, res) => {
  try {
    const { phone, type } = req.body;
    const u = req.user;
    const role = u.role || 'buyer';
    if (!phone) return res.status(400).json({ error: 'Nomor kosong' });
    if (type === 'global' && !roleMgr.canPairGlobal(role)) {
      return res.status(403).json({ error: 'Role Anda tidak bisa pairing global' });
    }
    const limit = roleMgr.getPairingLimit(role);
    const current = sessionMgr.getSessionsByOwner(u.username).length;
    if (current >= limit) return res.status(403).json({ error: `Batas pairing (${limit}) tercapai` });

    const order = current + 1;
    const { code } = await sessionMgr.requestPairing(u.username, phone.replace(/[^0-9]/g,''), type || 'private', order);
    res.json({ success: true, code, phone });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions/delete', requireLogin, (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Nomor kosong' });
    sessionMgr.deleteSession(req.user.username, phone);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sessions/status', requireLogin, (req, res) => {
  const list = sessionMgr.getSessionsByOwner(req.user.username);
  const live = Object.keys(sessionMgr.liveSockets);
  res.json({
    sessions: list.map(s => ({
      phone: s.phone, type: s.type, order: s.order,
      connected: live.includes(`${s.owner}:${s.phone}`)
    }))
  });
});

// API: SENDERS
app.get('/api/senders', requireLogin, (req, res) => {
  const u = req.user;
  const role = u.role || 'buyer';
  const all = loadSenders();
  const global = all.filter(s => s.type === 'global');
  const privateS = all.filter(s => s.type === 'private' && s.owner === u.username);
  const buyerSenders = roleMgr.getSendersForBuyer(u.username);
  res.json({
    global, private: privateS, buyerSenders,
    limit: roleMgr.getSenderLimit(role),
    canAddGlobal: roleMgr.canAddGlobalSender(role)
  });
});

app.post('/api/senders/add', requireLogin, (req, res) => {
  try {
    const u = req.user;
    const role = u.role || 'buyer';
    const { jid, name, type } = req.body;
    if (!jid || !type) return res.status(400).json({ error: 'Data tidak lengkap' });
    if (type === 'global' && !roleMgr.canAddGlobalSender(role)) {
      return res.status(403).json({ error: 'Role Anda tidak bisa tambah sender global' });
    }
    const all = loadSenders();
    if (type === 'global') {
      const count = all.filter(s => s.type === 'global' && s.owner === u.username).length;
      if (count >= roleMgr.getSenderLimit(role)) return res.status(403).json({ error: 'Limit sender global tercapai' });
    } else {
      const count = all.filter(s => s.type === 'private' && s.owner === u.username).length;
      if (count >= 20) return res.status(403).json({ error: 'Limit sender private tercapai (20)' });
    }
    all.push({
      jid: jid.includes('@') ? jid : jid + '@s.whatsapp.net',
      name: name || jid, type, owner: u.username, created: Date.now()
    });
    saveSenders(all);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/senders/delete', requireLogin, (req, res) => {
  try {
    const { jid } = req.body;
    const u = req.user;
    let all = loadSenders();
    const target = all.find(s => s.jid === jid);
    if (!target) return res.status(404).json({ error: 'Sender tidak ditemukan' });
    if (u.role !== 'developer' && u.role !== 'owner' && u.role !== 'admin') {
      if (target.type === 'global') return res.status(403).json({ error: 'Tidak bisa hapus sender global' });
      if (target.owner !== u.username) return res.status(403).json({ error: 'Bukan sender Anda' });
    }
    all = all.filter(s => s.jid !== jid);
    saveSenders(all);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: BUYERS
app.get('/api/buyers', requireLogin, (req, res) => {
  const u = req.user;
  if (!roleMgr.canAccess(u.role, 'manageBuyer')) return res.status(403).json({ error: 'Akses ditolak' });
  const list = roleMgr.getBuyersByReseller(u.username);
  res.json({ buyers: list });
});

app.post('/api/buyers/register', requireLogin, (req, res) => {
  const u = req.user;
  if (!roleMgr.canAccess(u.role, 'manageBuyer')) return res.status(403).json({ error: 'Akses ditolak' });
  const { buyer } = req.body;
  if (!buyer) return res.status(400).json({ error: 'Username buyer kosong' });
  const exists = loadCKeyUsers().find(x => x.username === buyer);
  if (!exists) return res.status(404).json({ error: 'Buyer belum terdaftar di sistem' });
  roleMgr.registerBuyer(u.username, buyer);
  res.json({ success: true });
});

app.post('/api/buyers/remove', requireLogin, (req, res) => {
  const u = req.user;
  if (!roleMgr.canAccess(u.role, 'manageBuyer')) return res.status(403).json({ error: 'Akses ditolak' });
  const { buyer } = req.body;
  roleMgr.removeBuyer(buyer);
  res.json({ success: true });
});

app.post('/api/buyers/sender/add', requireLogin, (req, res) => {
  const u = req.user;
  if (!roleMgr.canAccess(u.role, 'manageBuyer')) return res.status(403).json({ error: 'Akses ditolak' });
  const { buyer, jid } = req.body;
  if (!buyer || !jid) return res.status(400).json({ error: 'Data tidak lengkap' });
  const ok = roleMgr.addSenderToBuyer(u.username, buyer, jid.includes('@') ? jid : jid + '@s.whatsapp.net');
  if (!ok) return res.status(404).json({ error: 'Buyer bukan tanggungan Anda' });
  res.json({ success: true });
});

app.post('/api/buyers/sender/remove', requireLogin, (req, res) => {
  const u = req.user;
  if (!roleMgr.canAccess(u.role, 'manageBuyer')) return res.status(403).json({ error: 'Akses ditolak' });
  const { buyer, jid } = req.body;
  roleMgr.removeSenderFromBuyer(buyer, jid);
  res.json({ success: true });
});

// API: EXECUTE BUG
const lastExec = {};

app.post('/api/execute', requireLogin, async (req, res) => {
  try {
    const u = req.user;
    const { target, mode, senderJid } = req.body;
    if (!target || !/^[0-9]+$/.test(target)) return res.status(400).json({ error: 'Target salah' });
    if (!mode) return res.status(400).json({ error: 'Mode kosong' });

    const isVIPMode = mode.startsWith('vip');
    if (isVIPMode && !roleMgr.canAccess(u.role, 'bugVIP')) {
      return res.status(403).json({ error: 'Mode VIP khusus role VIP ke atas' });
    }

    const cd = senderJid ? config.cooldown.private : config.cooldown.global;
    const key = u.username;
    const now = Date.now();
    if (lastExec[key] && now - lastExec[key] < cd * 1000) {
      return res.status(429).json({ error: `Cooldown ${Math.ceil((cd*1000 - (now-lastExec[key]))/1000)}s` });
    }

    let sock = sessionMgr.getActiveSocket(u.username);
    if (!sock) sock = sessionMgr.getGlobalSocket();
    if (!sock) return res.status(400).json({ error: 'Tidak ada WA connect. Pairing dulu.' });

    const bugMap = {
      delay: bugFunctions.bugDelay, blank: bugFunctions.bugBlank,
      medium: bugFunctions.bugMedium, 'blank-ios': bugFunctions.bugBlankIos,
      forClose: bugFunctions.bugForClose,
      vip1: bugFunctions.bugVIP1, vip2: bugFunctions.bugVIP2,
      vip3: bugFunctions.bugVIP3, vip4: bugFunctions.bugVIP4,
      vip5: bugFunctions.bugVIP5, vip6: bugFunctions.bugVIP6,
      vip7: bugFunctions.bugVIP7, vip8: bugFunctions.bugVIP8,
      vip9: bugFunctions.bugVIP9, vip10: bugFunctions.bugVIP10
    };
    const fn = bugMap[mode];
    if (!fn) return res.status(400).json({ error: 'Mode tidak valid' });

    await fn(sock, target + '@s.whatsapp.net');
    lastExec[key] = now;
    res.json({ success: true, cooldown: cd });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: CEKBIO
app.get('/api/cekbio', requireLogin, async (req, res) => {
  try {
    const { target } = req.query;
    if (!target || !/^\d+$/.test(target)) return res.status(400).json({ error: 'Target salah' });

    let sock = sessionMgr.getActiveSocket(req.user.username) || sessionMgr.getGlobalSocket();
    if (!sock) return res.status(400).json({ error: 'WA belum connect' });

    const jid = target + '@s.whatsapp.net';
    const exists = await sock.onWhatsApp(jid);
    if (!exists?.[0]?.exists) return res.json({ number: target, registered: false });

    let bio = null, setAt = null;
    try {
      const st = await sock.fetchStatus(jid);
      const d = Array.isArray(st) ? st[0] : st;
      if (d?.status) {
        if (typeof d.status === 'object') { bio = d.status.status; setAt = d.status.setAt; }
        else bio = d.status;
      }
    } catch {}
    let metaBusiness = false;
    try { metaBusiness = !!(await sock.getBusinessProfile(jid)); } catch {}
    res.json({ number: target, registered: true, bio, setAt, metaBusiness });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/static', express.static(path.join(__dirname, 'public')));

app.listen(config.portVps, '0.0.0.0', () => {
  console.log(`🌐 Panel Rafael: http://localhost:${config.portVps}`);
});

// ============================================
// SCHEDULER (JANGAN DIUBAH — 6 JAM SEKALI)
// ============================================
setInterval(() => autoBackup(), 6 * 60 * 60 * 1000);       // Backup 6 jam
setInterval(cleanupExpired, 60 * 60 * 1000);                // Cleanup 1 jam
setInterval(notifyExpiringSoon, 60 * 60 * 1000);            // Notif 1 jam
setInterval(cleanupDeadSessions, 6 * 60 * 60 * 1000);       // Session 6 jam

setTimeout(() => {
  cleanupExpired();
  notifyExpiringSoon();
  cleanupDeadSessions();
}, 30 * 1000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

(async () => {
  await autoBackup();
  bot.launch();
  console.log('✅ Rafael Apps v2.0 OTW!');
})();