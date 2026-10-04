// ============================================
// RAFAEL APPS v3.0 — SENDER = SESSION
// BAGIAN 1/2
// ============================================
console.log('🚀 Memulai Rafael Apps v3.0...');

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

// ========== INIT FILES ==========
function ensureFile(p, c) {
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(p)) fs.writeFileSync(p, c);
}
ensureFile(userDBPath, '[]');
ensureFile(ckeyDB, '[]');
ensureFile(REF_FILE, '{}');

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

// ============================================
// AUTO BACKUP (6 JAM SEKALI)
// ============================================
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
      } catch (e) {}
    });
  } catch (e) {}
  backupRunning = false;
}

// ============================================
// CLEANUP EXPIRED
// ============================================
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

// ============================================
// MIDDLEWARE TELEGRAM ACCESS
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
━━━━━━━━━━━━━━━━━━━━</blockquote>

<i>Powered by ${config.settings.footer}</i>`;

    const keyboard = Markup.inlineKeyboard([
      [
        { text: '📊 Cek Akun', callback_data: 'tg_check' },
        { text: '➕ Buat CKey', callback_data: 'tg_ckey' }
      ],
      [
        { text: '📋 List Akun', callback_data: 'tg_list' }
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
      await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (e) {
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
      { text: '📋 List Akun', callback_data: 'tg_list' }
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

// ============================================
// /ckey — TANPA LINK PANEL
// ============================================
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
      username: nama, key: password, expired, role,
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
━━━━━━━━━━━━━━━━━━━━</blockquote>`);
  } catch (e) { ctx.reply('❌ ' + e.message); }
});

// ============================================
// /extend
// ============================================
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

// ============================================
// /help
// ============================================
bot.command('help', checkTelegramAccess, async (ctx) => {
  await ctx.replyWithHTML(`<blockquote>📖 <b>BANTUAN RAFAEL APPS</b>
━━━━━━━━━━━━━━━━━━━━
<b>Command tersedia:</b>

/start — Menu utama
/help — Bantuan
/ckey — Buat akun (owner)
/extend — Perpanjang akun (owner)
━━━━━━━━━━━━━━━━━━━━</blockquote>`);
});

// ============================================
// WEB PANEL — SETUP
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

// ============================================
// API: USER
// ============================================
app.get('/api/user', requireLogin, (req, res) => {
  const u = req.user;
  const role = u.role || 'buyer';
  res.json({
    username: u.username,
    role,
    expired: u.expired,
    expiredFormatted: formatWIB(u.expired),
    sessionLimit: roleMgr.getSessionLimit(role),
    canPairGlobal: roleMgr.canPairGlobal(role),
    canPairPrivate: roleMgr.canPairPrivate(role),
    canAssignSender: roleMgr.canAssignSender(role),
    canBugVIP: roleMgr.canAccess(role, 'bugVIP'),
    canManageBuyer: roleMgr.canAccess(role, 'manageBuyer'),
    media: config.media,
    cooldown: config.cooldown
  });
});
// ============================================
// API: SESSIONS (PAIRING)
// ============================================
app.get('/api/sessions', requireLogin, (req, res) => {
  const list = sessionMgr.getSessionsByOwner(req.user.username);
  res.json({ sessions: list });
});

app.get('/api/sessions/status', requireLogin, (req, res) => {
  const list = sessionMgr.getSessionsByOwner(req.user.username);
  const live = Object.keys(sessionMgr.liveSockets);
  res.json({
    sessions: list.map(s => ({
      phone: s.phone,
      senderJid: s.senderJid,
      type: s.type,
      order: s.order,
      connected: live.includes(`${s.owner}:${s.phone}`) && s.connected,
      assignedTo: s.assignedTo || []
    }))
  });
});

app.post('/api/sessions/pair', requireLogin, async (req, res) => {
  try {
    const { phone, type } = req.body;
    const u = req.user;
    const role = u.role || 'buyer';
    if (!phone) return res.status(400).json({ error: 'Nomor kosong' });
    if (!/^[0-9]+$/.test(phone.replace(/[^0-9]/g, ''))) return res.status(400).json({ error: 'Format nomor salah' });

    if (type === 'global' && !roleMgr.canPairGlobal(role)) {
      return res.status(403).json({ error: 'Role Anda tidak bisa pairing global' });
    }
    if (type !== 'global' && !roleMgr.canPairPrivate(role)) {
      return res.status(403).json({ error: 'Role Anda tidak bisa pairing' });
    }

    const limit = roleMgr.getSessionLimit(role);
    const current = sessionMgr.countSessionsByOwner(u.username);
    if (current >= limit) {
      return res.status(403).json({ error: `Batas session (${limit}) tercapai. Hapus dulu.` });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const existing = sessionMgr.getSession(u.username, cleanPhone);
    if (existing) {
      return res.status(400).json({ error: 'Nomor sudah dipairing' });
    }

    const result = await sessionMgr.requestPairing(u.username, cleanPhone, type || 'private', role);
    res.json({ success: true, code: result.code, phone: result.phone });
  } catch (e) {
    console.error('Pairing error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sessions/delete', requireLogin, (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Nomor kosong' });
    sessionMgr.deleteSession(req.user.username, phone);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// API: SENDERS (= SESSION yang tersedia)
// ============================================
app.get('/api/senders', requireLogin, (req, res) => {
  const u = req.user;
  const role = u.role || 'buyer';
  const available = sessionMgr.getAvailableSendersForUser(u.username, role);

  // Ambil info dari buyers.json
  const assignedFromBuyers = roleMgr.getAssignedSendersForBuyer(u.username);

  // Map ke format konsisten
  const toSenderObj = (s, source) => ({
    phone: s.phone,
    jid: s.senderJid,
    type: s.type,
    connected: (s.connected && !!sessionMgr.liveSockets[`${s.owner}:${s.phone}`]),
    owner: s.owner,
    source,
    order: s.order
  });

  const privateSenders = available.private.map(s => toSenderObj(s, 'private'));
  const globalSenders = available.global.map(s => toSenderObj(s, 'global'));

  const assignedSenders = [
    ...available.assigned.map(s => toSenderObj(s, 'assigned')),
    ...assignedFromBuyers.map(jid => {
      // Cari session detail
      const s = sessionMgr.getSessionByJid(jid);
      if (!s) return { jid, source: 'assigned', connected: false, type: 'assigned' };
      return toSenderObj(s, 'assigned');
    })
  ];

  // Hapus duplikat
  const seen = new Set();
  const assignedUnique = assignedSenders.filter(x => {
    if (seen.has(x.jid)) return false;
    seen.add(x.jid);
    return true;
  });

  res.json({
    private: privateSenders,
    global: globalSenders,
    assigned: assignedUnique,
    all: [...privateSenders, ...globalSenders, ...assignedUnique],
    sessionLimit: roleMgr.getSessionLimit(role),
    sessionUsed: sessionMgr.countSessionsByOwner(u.username),
    canAssignSender: roleMgr.canAssignSender(role)
  });
});

// ============================================
// API: EXECUTE BUG (pakai session sender)
// ============================================
const lastExec = {};

app.post('/api/execute', requireLogin, async (req, res) => {
  try {
    const u = req.user;
    const { target, mode, senderJid } = req.body;
    if (!target || !/^[0-9]+$/.test(target)) return res.status(400).json({ error: 'Target salah' });
    if (!mode) return res.status(400).json({ error: 'Mode kosong' });
    if (!senderJid) return res.status(400).json({ error: 'Pilih sender dulu' });

    // Cek akses mode VIP
    const isVIPMode = mode.startsWith('vip');
    if (isVIPMode && !roleMgr.canAccess(u.role, 'bugVIP')) {
      return res.status(403).json({ error: 'Mode VIP khusus role VIP ke atas' });
    }

    // Cari session berdasarkan sender JID
    const sessionData = sessionMgr.getSessionByJid(senderJid);
    if (!sessionData) return res.status(404).json({ error: 'Sender tidak ditemukan' });

    // Cek apakah user berhak pakai sender ini
    const allowed = roleMgr.canUseSender(u.username, u.role, sessionData);
    if (!allowed) return res.status(403).json({ error: 'Anda tidak berhak pakai sender ini' });

    // Cek session connected
    const key = `${sessionData.owner}:${sessionData.phone}`;
    const sock = sessionMgr.liveSockets[key];
    if (!sock) return res.status(400).json({ error: 'Sender belum connect. Tunggu sebentar.' });

    // Cek cooldown
    const cd = sessionData.type === 'global' ? config.cooldown.global : config.cooldown.private;
    const ckey = u.username + ':' + senderJid;
    const now = Date.now();
    if (lastExec[ckey] && now - lastExec[ckey] < cd * 1000) {
      const sisa = Math.ceil((cd * 1000 - (now - lastExec[ckey])) / 1000);
      return res.status(429).json({ error: `Cooldown ${sisa} detik` });
    }

    // Map function bug
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

    // Eksekusi bug pakai session sender
    await fn(sock, target + '@s.whatsapp.net');
    lastExec[ckey] = now;
    res.json({ success: true, cooldown: cd, usedSender: senderJid });
  } catch (e) {
    console.error('Execute error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// API: CEKBIO (pakai session sender pilihan)
// ============================================
app.get('/api/cekbio', requireLogin, async (req, res) => {
  try {
    const { target, senderJid } = req.query;
    if (!target || !/^\d+$/.test(target)) return res.status(400).json({ error: 'Target salah' });

    let sock = null;
    if (senderJid) {
      const sessionData = sessionMgr.getSessionByJid(senderJid);
      if (sessionData) {
        const allowed = roleMgr.canUseSender(req.user.username, req.user.role, sessionData);
        if (allowed) {
          sock = sessionMgr.liveSockets[`${sessionData.owner}:${sessionData.phone}`];
        }
      }
    }
    if (!sock) sock = sessionMgr.getActiveSocket(req.user.username);
    if (!sock) return res.status(400).json({ error: 'Tidak ada sender connect' });

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

// ============================================
// API: BUYERS (Manage Buyer untuk Reseller+)
// ============================================
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

  if (buyer === u.username) return res.status(400).json({ error: 'Tidak bisa daftarkan diri sendiri' });

  const ok = roleMgr.registerBuyer(u.username, buyer);
  if (!ok) return res.status(500).json({ error: 'Gagal daftarkan buyer' });
  res.json({ success: true });
});

app.post('/api/buyers/remove', requireLogin, (req, res) => {
  const u = req.user;
  if (!roleMgr.canAccess(u.role, 'manageBuyer')) return res.status(403).json({ error: 'Akses ditolak' });
  const { buyer } = req.body;
  roleMgr.removeBuyer(buyer);
  res.json({ success: true });
});

// ============================================
// API: ASSIGN SENDER KE BUYER
// ============================================
app.post('/api/buyers/assign-sender', requireLogin, (req, res) => {
  try {
    const u = req.user;
    if (!roleMgr.canAssignSender(u.role)) return res.status(403).json({ error: 'Akses ditolak' });
    const { buyer, senderJid } = req.body;
    if (!buyer || !senderJid) return res.status(400).json({ error: 'Data tidak lengkap' });

    // Cek buyer ada di bawah reseller ini
    const buyerData = roleMgr.getBuyerData(buyer);
    if (!buyerData || buyerData.reseller !== u.username) {
      return res.status(404).json({ error: 'Buyer bukan tanggungan Anda' });
    }

    // Cek session milik user ini
    const sessionData = sessionMgr.getSessionByJid(senderJid);
    if (!sessionData) return res.status(404).json({ error: 'Sender tidak ditemukan' });
    if (sessionData.owner !== u.username) {
      return res.status(403).json({ error: 'Sender bukan milik Anda' });
    }

    // Assign
    sessionMgr.assignSessionToBuyer(u.username, sessionData.phone, buyer);
    roleMgr.assignSenderToBuyer(u.username, buyer, senderJid);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/buyers/unassign-sender', requireLogin, (req, res) => {
  try {
    const u = req.user;
    if (!roleMgr.canAssignSender(u.role)) return res.status(403).json({ error: 'Akses ditolak' });
    const { buyer, senderJid } = req.body;
    if (!buyer || !senderJid) return res.status(400).json({ error: 'Data tidak lengkap' });

    const sessionData = sessionMgr.getSessionByJid(senderJid);
    if (sessionData && sessionData.owner === u.username) {
      sessionMgr.unassignSessionFromBuyer(u.username, sessionData.phone, buyer);
    }
    roleMgr.unassignSenderFromBuyer(buyer, senderJid);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// API: LIST SESSION MILIK RESELLER
// (untuk di-assign ke buyer)
// ============================================
app.get('/api/my-sessions', requireLogin, (req, res) => {
  const u = req.user;
  const list = sessionMgr.getSessionsByOwner(u.username);
  const live = Object.keys(sessionMgr.liveSockets);
  res.json({
    sessions: list.map(s => ({
      phone: s.phone,
      senderJid: s.senderJid,
      type: s.type,
      order: s.order,
      connected: live.includes(`${s.owner}:${s.phone}`) && s.connected,
      assignedTo: s.assignedTo || []
    }))
  });
});

// ============================================
// STATIC & LISTEN
// ============================================
app.use('/static', express.static(path.join(__dirname, 'public')));

app.listen(config.portVps, '0.0.0.0', () => {
  console.log(`🌐 Panel Rafael: http://localhost:${config.portVps}`);
});

// ============================================
// SCHEDULER
// ============================================
setInterval(() => autoBackup(), 6 * 60 * 60 * 1000);
setInterval(cleanupExpired, 60 * 60 * 1000);
setInterval(notifyExpiringSoon, 60 * 60 * 1000);

setTimeout(() => {
  cleanupExpired();
  notifyExpiringSoon();
}, 30 * 1000);

// ============================================
// RECONNECT ALL SESSIONS ON START
// ============================================
async function reconnectAllSessions() {
  try {
    const all = sessionMgr.getAllSessions();
    console.log(`🔄 Reconnect ${all.length} session...`);
    for (const s of all) {
      try {
        await sessionMgr.connectSession(s.owner, s.phone, s.type, s.order);
        await new Promise(r => setTimeout(r, 1500)); // jeda antar session
      } catch (e) {
        console.error(`Gagal connect ${s.owner}:${s.phone}:`, e.message);
      }
    }
    console.log('✅ Reconnect session selesai');
  } catch (e) {
    console.error('Reconnect error:', e.message);
  }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ============================================
// RUN
// ============================================
(async () => {
  await autoBackup();
  bot.launch();
  console.log('✅ Rafael Apps v3.0 OTW!');
  // Reconnect sessions setelah bot siap
  setTimeout(reconnectAllSessions, 5000);
})();