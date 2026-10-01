// ============================================
// RAFAEL BOT - BASE FIXED v1.0
// ============================================
console.log('🚀 Memulai Rafael Bot...');

const { Telegraf, Markup } = require('telegraf');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const dns = require("dns").promises;
const chalk = require('chalk');
const axios = require('axios');
const archiver = require('archiver');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const FormData = require('form-data');
const { createCanvas, loadImage } = require('canvas');
const config = require('./config');
const path = require('path');
const { exec } = require('child_process');

// ========== KONSTANTA ==========
const OWNER_ID = config.ownerId.toString();
const USERNAME_OWNER = config.usernameOwner;
const bot = new Telegraf(config.telegramBotToken);
const app = express();
app.use(require("cors")());

const userDBPath = path.join(__dirname, 'database', 'users.json');
const ckeyDB = path.join(__dirname, 'database', 'keyapk.json');
const REF_FILE = path.join(__dirname, 'database', 'referral.json');
const dataFile = path.join(__dirname, 'database', 'roles.json');

let roleData = { owners: [], premiums: [] };
let Angkasa = null;
let waConnectionStatus = 'closed';
const cooldowns = {};

// ========== INIT FILE ==========
function ensureFile(filePath, defaultContent) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, defaultContent);
}
ensureFile(REF_FILE, '{}');
ensureFile(userDBPath, '[]');
ensureFile(ckeyDB, '[]');
ensureFile(dataFile, '{"owners":[],"premiums":[]}');

// ========== DATABASE (SAFE) ==========
function loadRefs() {
  try {
    const raw = fs.readFileSync(REF_FILE, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("⚠️ loadRefs error:", e.message);
    return {};
  }
}
function saveRefs(data) {
  try { fs.writeFileSync(REF_FILE, JSON.stringify(data, null, 2)); }
  catch (e) { console.error("saveRefs error:", e.message); }
}

function loadUsers() {
  try {
    const raw = fs.readFileSync(userDBPath, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
function saveUsers(data) {
  try { fs.writeFileSync(userDBPath, JSON.stringify(data, null, 2)); }
  catch (e) { console.error("saveUsers error:", e.message); }
}

function loadCKeyUsers() {
  try {
    const raw = fs.readFileSync(ckeyDB, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("⚠️ loadCKeyUsers error:", e.message);
    return [];
  }
}
function saveCKeyUsers(data) {
  try { fs.writeFileSync(ckeyDB, JSON.stringify(data, null, 2)); }
  catch (e) { console.error("saveCKeyUsers error:", e.message); }
}

function loadRoles() {
  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    roleData = raw.trim() ? JSON.parse(raw) : { owners: [], premiums: [] };
  } catch (err) {
    console.error("⚠️ Gagal baca roles.json:", err.message);
    roleData = { owners: [], premiums: [] };
  }
  if (!Array.isArray(roleData.owners)) roleData.owners = [];
  if (!Array.isArray(roleData.premiums)) roleData.premiums = [];
  roleData.owners = roleData.owners.map(o =>
    typeof o === "string" ? { id: o, expireAt: "permanent", startAt: Date.now() } : o
  );
  roleData.premiums = roleData.premiums.map(p =>
    typeof p === "string" ? { id: p, expireAt: "permanent", startAt: Date.now() } : p
  );
  saveRoles();
}
function saveRoles() {
  try { fs.writeFileSync(dataFile, JSON.stringify(roleData, null, 2)); }
  catch (e) { console.error("saveRoles error:", e.message); }
}
loadRoles();

// ========== HELPER ==========
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isExpired(expireAt) {
  if (!expireAt) return true;
  if (expireAt === "permanent") return false;
  return Date.now() > expireAt;
}

function isOwner(id) {
  const uid = id.toString();
  if (uid === OWNER_ID) return true;
  const o = roleData.owners.find(x => x.id === uid);
  return o ? !isExpired(o.expireAt) : false;
}

function isPremium(id) {
  const uid = id.toString();
  if (isOwner(uid)) return true;
  const p = roleData.premiums.find(x => x.id === uid);
  return p ? !isExpired(p.expireAt) : false;
}

function parseDuration(dur) {
  if (!dur) return null;
  const unit = dur.slice(-1).toLowerCase();
  const num = parseInt(dur);
  const now = Date.now();
  switch (unit) {
    case "d": return now + num * 86400000;
    case "w": return now + num * 604800000;
    case "m": return now + num * 2592000000;
    case "p": return "permanent";
    default: return null;
  }
}

function formatDuration(dur) {
  if (dur === "permanent") return "Permanen";
  const hari = Math.max(1, Math.ceil((dur - Date.now()) / 86400000));
  return `${hari} hari`;
}

function formatDate(ts) {
  if (ts === "permanent") return "∞";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric"
  }).format(new Date(ts));
}

function getDurationText(expireAt, startAt) {
  if (expireAt === "permanent") return "Permanen";
  const days = Math.round((expireAt - startAt) / 86400000);
  if (days % 30 === 0) return `${days / 30} bulan`;
  if (days % 7 === 0) return `${days / 7} minggu`;
  return `${days} hari`;
}

function formatWIB(timestamp) {
  const f = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
  const p = f.formatToParts(timestamp);
  const get = t => p.find(x => x.type === t)?.value || "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")} WIB`;
}

function escapeHTML(t = '') {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getUptime() {
  const s = process.uptime();
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${Math.floor(s%60)}s`;
}

function generatePagedList(items, page = 1, type = "premium") {
  const perPage = 15;
  const totalPages = Math.ceil(items.length / perPage) || 1;
  const paged = items.slice((page-1)*perPage, page*perPage);
  let text = type === "owner"
    ? "<blockquote>👑 <b>Daftar Owner Rafael</b>\n━━━━━━━━━━━━━━━━━━</blockquote>\n"
    : "<blockquote>📜 <b>Daftar Premium Rafael</b>\n━━━━━━━━━━━━━━━━━━</blockquote>\n";
  for (const u of paged) {
    if (isExpired(u.expireAt)) continue;
    text += `<blockquote>👤 <b>ID:</b> <code>${u.id}</code>\n⏱ <b>Durasi:</b> ${getDurationText(u.expireAt, u.startAt)}\n📅 ${formatDate(u.startAt)} - ${formatDate(u.expireAt)}</blockquote>\n`;
  }
  text += `<blockquote>📄 Halaman ${page} / ${totalPages}</blockquote>`;
  const buttons = [];
  if (page > 1) buttons.push({ text: "◀️ Prev", callback_data: `${type}_page_${page-1}` });
  if (page < totalPages) buttons.push({ text: "Next ▶️", callback_data: `${type}_page_${page+1}` });
  return { text, buttons: buttons.length ? [buttons] : [] };
}

function generateUserList(users, page = 1) {
  const perPage = 20;
  const totalPages = Math.ceil(users.length / perPage) || 1;
  const pageIds = users.slice((page-1)*perPage, page*perPage);
  let text = `<blockquote><b>📊 Total ID Rafael</b>\n━━━━━━━━━━━━━━━━━━</blockquote>\n`;
  pageIds.forEach((id, i) => {
    text += `<blockquote>${(page-1)*perPage + i + 1}. <code>${id}</code></blockquote>\n`;
  });
  text += `<blockquote>📄 Halaman ${page} / ${totalPages}\n👥 Total: ${users.length}</blockquote>`;
  const buttons = [];
  if (page > 1) buttons.push({ text: "◀️ Prev", callback_data: `users_page_${page-1}` });
  if (page < totalPages) buttons.push({ text: "Next ▶️", callback_data: `users_page_${page+1}` });
  return { text, buttons: buttons.length ? [buttons] : [] };
}

// ========== AUTO BACKUP ==========
async function autoBackup() {
  try {
    const backupDir = path.join(__dirname, 'backup');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const zipPath = path.join(backupDir, `backup-${ts}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);

    for (const item of ['database', 'rafael.js', 'config.js', 'package.json']) {
      const p = path.join(__dirname, item);
      if (fs.existsSync(p)) {
        if (fs.lstatSync(p).isDirectory()) archive.directory(p, item);
        else archive.file(p, { name: item });
      }
    }
    await archive.finalize();
    output.on('close', async () => {
      console.log(`✅ Backup: ${zipPath}`);
      try {
        await bot.telegram.sendDocument(
          config.ownerId,
          { source: zipPath },
          { caption: `📦 Backup Rafael - ${new Date().toLocaleString('id-ID')}` }
        );
        fs.unlinkSync(zipPath);
        console.log('🗑️ Backup lokal dihapus');
      } catch (err) { console.error('❌ Gagal kirim backup:', err.message); }
    });
  } catch (err) { console.error('❌ Backup error:', err.message); }
}

// ========== WHATSAPP ==========
async function startWhatsAppClient() {
  console.log("📱 Memulai koneksi WhatsApp...");
  try {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    const { version } = await fetchLatestBaileysVersion();

    Angkasa = makeWASocket({
      version,
      keepAliveIntervalMs: 30000,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      auth: state,
      browser: ["Mac OS", "Safari", "10.15.7"],
      getMessage: async () => ({ conversation: 'P' }),
    });

    Angkasa.ev.on('creds.update', saveCreds);
    Angkasa.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection) {
        waConnectionStatus = connection;
        console.log('🔌 WA Status:', connection);
      }
      if (connection === 'open') console.log(chalk.green.bold('✅ RAFAEL WA CONNECTED'));
      if (connection === 'close') {
        const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(chalk.red.bold('❌ RAFAEL WA DISCONNECTED'));
        if (shouldReconnect) setTimeout(startWhatsAppClient, 5000);
        else { Angkasa = null; }
      }
    });
  } catch (e) { console.error("❌ WA error:", e.message); }
}

// ========== CHECK ACCESS ==========
const checkAccess = (level) => async (ctx, next) => {
  if (level === 'owner' && ctx.from.id !== config.ownerId) {
    return ctx.reply(config.message.owner);
  }
  await next();
};

// ========== AUTO SAVE USER ==========
bot.use(async (ctx, next) => {
  try {
    if (ctx.chat?.type === 'private') {
      const userId = ctx.from.id.toString();
      const users = loadUsers();
      if (!users.includes(userId)) {
        users.push(userId);
        saveUsers(users);
        console.log(`✅ User baru: ${userId}`);
      }
    }
  } catch (err) { console.error('❌ Auto-save error:', err.message); }
  await next();
});

// ========== /start ==========
bot.command('start', async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const refData = loadRefs();

    const payload = ctx.message.text.split(' ')[1];
    if (payload && payload.startsWith('ref_')) {
      const referrerId = payload.replace('ref_', '');
      if (referrerId !== userId) {
        if (!refData[referrerId]) refData[referrerId] = { invited: [], bonusChecks: 0, totalInvited: 0 };
        if (!refData[referrerId].invited.includes(userId)) {
          refData[referrerId].invited.push(userId);
          saveRefs(refData);
          try {
            await ctx.telegram.sendMessage(referrerId,
              `<blockquote>📢 ${userName} baru join lewat referral kamu 🎉</blockquote>`,
              { parse_mode: 'HTML' });
          } catch {}
        }
      }
    }

    const caption = `<blockquote>🪐 Ciao! Sono Rafael Bot.
╔─═⊱ 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝚁𝙰𝙵𝙰𝙴𝙻 ─═⬣
║ 𝙸𝙳 : <code>${userId}</code>
║ 𝚄𝚂𝙴𝚁 : ${userName}
║ 𝙳𝙴𝚅 : ${USERNAME_OWNER}
║ 𝙾𝙽𝙻𝙸𝙽𝙴 : ${getUptime()}
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`;

    const keyboard = Markup.inlineKeyboard([
      [{ text: '🪐 𝙼𝙴𝙽𝚄 𝙰𝙿𝙺𝙱𝚄𝙶', callback_data: 'apkbug' },
       { text: '🪐 𝙼𝙴𝙽𝚄 𝙾𝚆𝙽𝙴𝚁', callback_data: 'owner' }],
      [{ text: '🌐 𝙼𝙴𝙽𝚄 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿', callback_data: 'whatsapp' },
       { text: '🚀 𝙼𝙴𝙽𝚄 𝙼𝙾𝚁𝙴', callback_data: 'more' }],
      [{ text: '👑 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁', url: `https://t.me/${USERNAME_OWNER.replace('@', '')}` }]
    ]);

    try {
      await ctx.replyWithPhoto({ source: './database/rafael.jpg' }, {
        caption, parse_mode: 'HTML', ...keyboard
      });
    } catch {
      await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (err) {
    console.error('Error /start:', err.message);
  }
});

// ========== MENU CALLBACKS ==========
const menuTexts = {
  apkbug: `<blockquote>╔─═⊱ 𝙼𝙴𝙽𝚄 𝙰𝙿𝙺𝙱𝚄𝙶 ─═⬣
║⁀➴ /ckey nama,30d
║╰┈➤ 𝙱𝚄𝙰𝚃 𝙰𝙺𝚄𝙽 𝙻𝙾𝙶𝙸𝙽 𝙿𝙰𝙽𝙴𝙻
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`,
  owner: `<blockquote>╔─═⊱ 𝙼𝙴𝙽𝚄 𝙾𝚆𝙽𝙴𝚁 ─═⬣
║⁀➴ /pairing 628xxx
║╰┈➤ 𝙺𝙾𝙽𝙴𝙺 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿
║⁀➴ /clearsesi
║╰┈➤ 𝙷𝙰𝙿𝚄𝚂 𝚂𝙴𝚂𝚂𝙸𝙾𝙽
║⁀➴ /broadcast pesan
║╰┈➤ 𝙺𝙸𝚁𝙸𝙼 𝙺𝙴 𝚂𝙴𝙼𝚄𝙰 𝚄𝚂𝙴𝚁
║⁀➴ /totaluser
║╰┈➤ 𝙹𝚄𝙼𝙻𝙰𝙷 𝚄𝚂𝙴𝚁
║⁀➴ /listid
║╰┈➤ 𝙳𝙰𝙵𝚃𝙰𝚁 𝙸𝙳
║⁀➴ /addprem /delprem /listprem
║⁀➴ /addowner /delowner /listowner
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`,
  whatsapp: `<blockquote>╔─═⊱ 𝙼𝙴𝙽𝚄 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿 ─═⬣
║⁀➴ /cekbio 628xxx
║╰┈➤ 𝙲𝙴𝙺 𝙱𝙸𝙾
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`,
  more: `<blockquote>╔─═⊱ 𝙼𝙴𝙽𝚄 𝙼𝙾𝚁𝙴 ─═⬣
║⁀➴ /cekip google.com
║╰┈➤ 𝙲𝙴𝙺 𝙸𝙿 𝙳𝙾𝙼𝙰𝙸𝙽
║⁀➴ /cekid
║╰┈➤ 𝙲𝙴𝙺 𝙸𝙳 𝚃𝙴𝙻𝙴𝙶𝚁𝙰𝙼
║⁀➴ /info
║╰┈➤ 𝙸𝙽𝙵𝙾 𝙰𝙺𝚄𝙽
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`
};

for (const key of Object.keys(menuTexts)) {
  bot.action(key, async (ctx) => {
    try {
      await ctx.deleteMessage().catch(() => {});
      await ctx.replyWithPhoto({ source: './database/rafael.jpg' }, {
        caption: menuTexts[key],
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'back_to_start' }]])
      }).catch(async () => {
        await ctx.reply(menuTexts[key], {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'back_to_start' }]])
        });
      });
    } catch (err) { console.error(`Error menu ${key}:`, err.message); }
  });
}

bot.action('back_to_start', async (ctx) => {
  try {
    await ctx.deleteMessage().catch(() => {});
    const userId = ctx.from.id.toString();
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    const caption = `<blockquote>🪐 Ciao! Sono Rafael Bot.
╔─═⊱ 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝚁𝙰𝙵𝙰𝙴𝙻 ─═⬣
║ 𝙸𝙳 : <code>${userId}</code>
║ 𝚄𝚂𝙴𝚁 : ${userName}
║ 𝙳𝙴𝚅 : ${USERNAME_OWNER}
║ 𝙾𝙽𝙻𝙸𝙽𝙴 : ${getUptime()}
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`;

    const keyboard = Markup.inlineKeyboard([
      [{ text: '🪐 𝙼𝙴𝙽𝚄 𝙰𝙿𝙺𝙱𝚄𝙶', callback_data: 'apkbug' },
       { text: '🪐 𝙼𝙴𝙽𝚄 𝙾𝚆𝙽𝙴𝚁', callback_data: 'owner' }],
      [{ text: '🌐 𝙼𝙴𝙽𝚄 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿', callback_data: 'whatsapp' },
       { text: '🚀 𝙼𝙴𝙽𝚄 𝙼𝙾𝚁𝙴', callback_data: 'more' }],
      [{ text: '👑 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁', url: `https://t.me/${USERNAME_OWNER.replace('@', '')}` }]
    ]);

    await ctx.replyWithPhoto({ source: './database/rafael.jpg' }, {
      caption, parse_mode: 'HTML', ...keyboard
    }).catch(async () => {
      await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
    });
  } catch (err) { console.error('Error back_to_start:', err.message); }
});

// ========== /ckey ==========
bot.command("ckey", async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    if (userId !== OWNER_ID) return ctx.reply("🚫 Khusus Owner!");

    const args = ctx.message.text.split(" ").slice(1).join(" ");
    if (!args) return ctx.reply("📌 Format:\n/ckey nama,30d\n/ckey nama,30d,PASSWORD");

    const [nama, durasi, customPw] = args.split(",");

    if (!nama || !durasi || !durasi.endsWith("d")) {
      return ctx.reply("❌ Format salah!\nContoh: /ckey rafael,30d");
    }

    const hari = parseInt(durasi.replace("d", ""));
    if (isNaN(hari)) return ctx.reply("❌ Durasi harus angka!");

    let password = customPw
      ? customPw.toUpperCase()
      : [...Array(8)].map(() => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]).join("");

    const expired = Date.now() + hari * 86400000;
    const users = loadCKeyUsers();

    if (users.find(u => u.username === nama)) {
      return ctx.reply("⚠️ Username sudah ada!");
    }

    users.push({ username: nama, key: password, expired });
    saveCKeyUsers(users);

    ctx.reply(`✅ CKey Rafael Dibuat!
👤 User: ${nama}
🔑 Key: ${password}
⏳ Aktif: ${hari} hari
📅 Expired: ${formatWIB(expired)}`);
  } catch (err) {
    console.error("❌ /ckey error:", err);
    ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ========== OWNER COMMANDS ==========
bot.command('pairing', checkAccess('owner'), async (ctx) => {
  const phoneNumber = ctx.message.text.split(' ')[1]?.replace(/[^0-9]/g, '');
  if (!phoneNumber) return ctx.reply("Format: /pairing 628xxx");
  if (!Angkasa) return ctx.reply("WA lagi down.");
  try {
    await ctx.reply("Menunggu kode pairing...");
    const code = await Angkasa.requestPairingCode(phoneNumber);
    await ctx.reply(`📲 Kode Pairing: <code>${code}</code>`, { parse_mode: 'HTML' });
  } catch (e) {
    await ctx.reply("Gagal pairing, coba lagi.");
  }
});

bot.command('clearsesi', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) return ctx.reply("🚫 Khusus owner.");
  const sessionDir = path.join(__dirname, 'session');
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      fs.mkdirSync(sessionDir);
    }
    await ctx.reply("🧹 Session dihapus. Restart 3 detik...");
    setTimeout(() => exec('pm2 restart all || node rafael.js', () => {}), 3000);
  } catch { ctx.reply("⚠️ Gagal hapus session."); }
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) return ctx.reply("🚫 Khusus owner.");
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply("Format: /broadcast pesan");
  const users = loadUsers();
  if (!users.length) return ctx.reply("📭 Belum ada user.");
  await ctx.reply(`📢 Broadcast ke ${users.length} user...`);
  let s = 0, f = 0;
  for (const id of users) {
    try { await ctx.telegram.sendMessage(id, text, { parse_mode: 'HTML' }); s++; await sleep(100); }
    catch { f++; }
  }
  ctx.reply(`✅ Selesai!\n📨 Terkirim: ${s}\n❌ Gagal: ${f}`);
});

bot.command('totaluser', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) return ctx.reply("🚫 Khusus owner.");
  ctx.reply(`📊 Total User: ${loadUsers().length}`);
});

bot.command("listid", async (ctx) => {
  if (!isOwner(ctx.from.id.toString())) return ctx.reply("🚫 Khusus owner.");
  const users = loadUsers();
  if (!users.length) return ctx.reply("📭 Belum ada user.");
  const { text, buttons } = generateUserList(users, 1);
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
});

bot.command("addprem", async (ctx) => {
  if (!isOwner(ctx.from.id.toString())) return ctx.reply("🚫 Khusus owner.");
  const [targetId, durasi] = ctx.message.text.split(" ").slice(1);
  if (!targetId || !durasi) return ctx.reply("Format: /addprem user_id durasi");
  const expireAt = parseDuration(durasi);
  if (!expireAt) return ctx.reply("⚠️ Durasi invalid (d/w/m/p).");
  roleData.premiums = roleData.premiums.filter(p => p.id !== targetId);
  roleData.premiums.push({ id: targetId, expireAt, startAt: Date.now() });
  saveRoles();
  const waktu = formatDuration(expireAt);
  ctx.reply(`✨ <code>${targetId}</code> Premium <b>${waktu}</b>!`, { parse_mode: "HTML" });
  try {
    await ctx.telegram.sendMessage(targetId,
      `<blockquote>🎉 Selamat! Anda Premium Rafael <b>${waktu}</b>!</blockquote>`,
      { parse_mode: "HTML" });
  } catch {}
});

bot.command("delprem", async (ctx) => {
  if (!isOwner(ctx.from.id.toString())) return ctx.reply("🚫 Khusus owner.");
  const targetId = ctx.message.text.split(" ").slice(1)[0];
  if (!targetId) return ctx.reply("Format: /delprem user_id");
  const before = roleData.premiums.length;
  roleData.premiums = roleData.premiums.filter(p => p.id !== targetId);
  saveRoles();
  if (roleData.premiums.length === before) return ctx.reply("❌ Tidak ditemukan.");
  ctx.reply(`✅ <code>${targetId}</code> dihapus dari Premium.`, { parse_mode: "HTML" });
});

bot.command("listprem", async (ctx) => {
  if (!isOwner(ctx.from.id.toString())) return ctx.reply("🚫 Khusus owner.");
  const data = roleData.premiums.filter(p => !isExpired(p.expireAt));
  if (!data.length) return ctx.reply("📭 Belum ada Premium.");
  const { text, buttons } = generatePagedList(data, 1, "premium");
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
});

bot.command("addowner", async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) return ctx.reply("🚫 Khusus owner utama.");
  const [targetId, durasi] = ctx.message.text.split(" ").slice(1);
  if (!targetId || !durasi) return ctx.reply("Format: /addowner user_id durasi");
  const expireAt = parseDuration(durasi);
  if (!expireAt) return ctx.reply("⚠️ Durasi invalid.");
  roleData.owners = roleData.owners.filter(o => o.id !== targetId);
  roleData.owners.push({ id: targetId, expireAt, startAt: Date.now() });
  saveRoles();
  const waktu = formatDuration(expireAt);
  ctx.reply(`✅ <code>${targetId}</code> jadi Owner <b>${waktu}</b>!`, { parse_mode: "HTML" });
  try {
    await ctx.telegram.sendMessage(targetId,
      `<blockquote>👑 Selamat! Anda Owner Rafael <b>${waktu}</b>!</blockquote>`,
      { parse_mode: "HTML" });
  } catch {}
});

bot.command("delowner", async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) return ctx.reply("🚫 Khusus owner utama.");
  const targetId = ctx.message.text.split(" ").slice(1)[0];
  if (!targetId) return ctx.reply("Format: /delowner user_id");
  const before = roleData.owners.length;
  roleData.owners = roleData.owners.filter(o => o.id !== targetId);
  saveRoles();
  if (roleData.owners.length === before) return ctx.reply("❌ Tidak ditemukan.");
  ctx.reply(`✅ <code>${targetId}</code> dihapus dari Owner.`, { parse_mode: "HTML" });
});

bot.command("listowner", async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) return ctx.reply("🚫 Khusus owner utama.");
  const data = roleData.owners.filter(o => !isExpired(o.expireAt));
  if (!data.length) return ctx.reply("📭 Belum ada Owner tambahan.");
  const { text, buttons } = generatePagedList(data, 1, "owner");
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
});

// ========== /info ==========
bot.command('info', async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const refData = loadRefs();
    if (!refData[userId]) { refData[userId] = { invited: [], bonusChecks: 0, totalInvited: 0 }; saveRefs(refData); }

    const o = roleData.owners.find(x => x.id === userId && !isExpired(x.expireAt));
    const p = roleData.premiums.find(x => x.id === userId && !isExpired(x.expireAt));
    const ref = refData[userId];
    const link = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;

    const caption = `<blockquote>📊 <b>INFO AKUN RAFAEL</b>
────────────────
👤 <b>Nama:</b> ${userName}
🆔 <b>ID:</b> <code>${userId}</code>
💎 <b>Premium:</b> ${p ? getDurationText(p.expireAt, p.startAt) : "NON PREMIUM"}
👑 <b>Owner:</b> ${o ? getDurationText(o.expireAt, o.startAt) : "NON OWNER"}
────────────────
🎁 <b>Bonus Cek:</b> ${ref.bonusChecks}x
👥 <b>Referral:</b> ${ref.invited.length} orang
🏆 <b>Klaim:</b> ${ref.totalInvited} orang
────────────────
🔗 <a href="${link}">${link}</a></blockquote>`;

    await ctx.replyWithPhoto({ source: './database/rafael.jpg' }, {
      caption, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[
        { text: '🔗 Bagikan', switch_inline_query: link },
        { text: '💬 Dev', url: `https://t.me/${USERNAME_OWNER.replace('@', '')}` }
      ]]}
    }).catch(async () => {
      await ctx.reply(caption, { parse_mode: 'HTML' });
    });
  } catch (err) {
    console.error('Error info:', err);
    ctx.reply("⚠️ Gagal tampil info.");
  }
});

// ========== /cekip ==========
bot.command("cekip", async (ctx) => {
  const domain = ctx.message.text.split(" ")[1];
  if (!domain) return ctx.reply("Contoh: /cekip google.com");
  try {
    const result = await dns.lookup(domain);
    ctx.reply(`🔍 <b>Hasil Cek IP</b>\n\n🌐 ${domain}\n📡 <code>${result.address}</code>`, { parse_mode: 'HTML' });
  } catch { ctx.reply("❌ Domain tidak valid."); }
});

// ========== /cekid ==========
bot.command('cekid', async (ctx) => {
  try {
    const msg = ctx.message;
    const targetUser = msg.reply_to_message ? msg.reply_to_message.from : msg.from;
    const userId = targetUser.id.toString();
    const name = escapeHTML(targetUser.first_name || '-');
    const username = targetUser.username ? `@${escapeHTML(targetUser.username)}` : '-';
    const tanggal = new Date().toISOString().split('T')[0];

    let avatarUrl = 'https://i.ibb.co/9v2YzS0/default-avatar.png';
    try {
      const photos = await ctx.telegram.getUserProfilePhotos(userId, { limit: 1 });
      if (photos.total_count > 0) {
        const file = photos.photos[0][0];
        avatarUrl = (await ctx.telegram.getFileLink(file.file_id)).href;
      }
    } catch {}

    const canvas = createCanvas(800, 450);
    const c = canvas.getContext('2d');
    c.fillStyle = '#0a1a2f'; c.fillRect(0, 0, 800, 450);
    c.fillStyle = '#fff'; c.roundRect(40, 60, 720, 330, 20); c.fill();
    c.fillStyle = '#0a1a2f'; c.font = 'bold 36px Arial'; c.textAlign = 'center';
    c.fillText('ID CARD RAFAEL', 400, 120);

    const avatar = await loadImage(avatarUrl);
    c.save(); c.beginPath(); c.arc(160, 240, 70, 0, Math.PI * 2); c.clip();
    c.drawImage(avatar, 90, 170, 140, 140); c.restore();

    c.fillStyle = '#000'; c.textAlign = 'left'; c.font = 'bold 26px Arial';
    c.fillText('Info Pengguna:', 270, 180);
    c.font = '22px Arial';
    c.fillText(`Nama: ${name}`, 270, 220);
    c.fillText(`ID: ${userId}`, 270, 255);
    c.fillText(`Username: ${username}`, 270, 290);
    c.fillText(`Tanggal: ${tanggal}`, 270, 325);

    c.textAlign = 'center'; c.font = 'italic 20px Arial'; c.fillStyle = '#666';
    c.fillText('ID Card by Rafael Dev', 400, 425);

    const outPath = path.join(__dirname, `idcard_${userId}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));

    await ctx.replyWithPhoto({ source: outPath }, {
      caption: `<blockquote>👤 <b>${name}</b>\n🆔 <code>${userId}</code>\n📛 ${username}</blockquote>`,
      parse_mode: 'HTML'
    });
    fs.unlinkSync(outPath);
  } catch (err) {
    console.error(err);
    ctx.reply('⚠️ Gagal buat ID Card.');
  }
});

// ========== CALLBACK PAGINATION ==========
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data) return;
  const menuPrefixes = ["apkbug", "owner", "whatsapp", "more", "back_to_start"];
  if (menuPrefixes.includes(data)) return;

  try {
    if (data.startsWith("users_")) {
      const page = parseInt(data.match(/users_page_(\d+)/)?.[1] || 1);
      const { text, buttons } = generateUserList(loadUsers(), page);
      return await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
    }
    if (data.startsWith("premium_")) {
      const page = parseInt(data.match(/premium_page_(\d+)/)?.[1] || 1);
      const list = roleData.premiums.filter(p => !isExpired(p.expireAt));
      const { text, buttons } = generatePagedList(list, page, "premium");
      return await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
    }
    if (data.startsWith("owner_")) {
      const page = parseInt(data.match(/owner_page_(\d+)/)?.[1] || 1);
      const list = roleData.owners.filter(o => !isExpired(o.expireAt));
      const { text, buttons } = generatePagedList(list, page, "owner");
      return await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
    }
  } catch (err) { console.error("Callback error:", err); }
  await ctx.answerCbQuery().catch(() => {});
});

// ========== WEB PANEL ==========
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

const loginFile = path.join(__dirname, "RAFAEL", "Login.html");
const panelFile = path.join(__dirname, "RAFAEL", "Rafael.html");

app.get("/", (req, res) => res.sendFile(loginFile));
app.get("/login", (req, res) => res.sendFile(loginFile));

app.get("/logout", (req, res) => {
  res.clearCookie("sessionUser");
  res.redirect("/login");
});

app.get("/panel", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.sendFile(loginFile);
  const user = loadCKeyUsers().find(u => u.username === username);
  if (!user || Date.now() > user.expired) return res.sendFile(loginFile);
  res.sendFile(panelFile);
});

app.post("/auth", (req, res) => {
  const { username, key } = req.body;
  const user = loadCKeyUsers().find(u => u.username === username);
  if (!user) return res.redirect("/login?msg=" + encodeURIComponent("Username tidak ditemukan!"));
  if (user.key !== key) return res.redirect("/login?msg=" + encodeURIComponent("Key salah!"));
  if (Date.now() > user.expired) return res.redirect("/login?msg=" + encodeURIComponent("Akses expired!"));
  res.cookie("sessionUser", username, { maxAge: 3600000 });
  res.redirect("/panel");
});

function requireLogin(req, res, next) {
  const username = req.cookies.sessionUser;
  if (!username) return res.status(401).json({ error: 'Not authenticated' });
  const user = loadCKeyUsers().find(u => u.username === username);
  if (!user || Date.now() > user.expired) return res.status(401).json({ error: 'Session expired' });
  req.currentUser = user;
  next();
}

app.get('/api/status-wa', requireLogin, (req, res) => {
  res.json({ status: waConnectionStatus || 'closed' });
});

app.get('/api/dashboard', requireLogin, (req, res) => {
  try {
    const users = loadCKeyUsers();
    res.json({
      status: waConnectionStatus || 'closed',
      totalAccounts: users.length,
      accounts: users.map(u => ({ username: u.username, expired: u.expired }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/cekbio', requireLogin, async (req, res) => {
  try {
    const target = req.query.target;
    if (!target) return res.status(400).json({ error: 'Nomor kosong' });
    if (!/^\d+$/.test(target)) return res.status(400).json({ error: 'Format salah' });
    if (!Angkasa || waConnectionStatus !== "open") return res.status(400).json({ error: 'WA belum connect' });

    const jid = target + "@s.whatsapp.net";
    const exists = await Angkasa.onWhatsApp(jid);
    if (!exists?.[0]?.exists) return res.json({ number: target, registered: false });

    let bio = null, setAt = null;
    try {
      const status = await Angkasa.fetchStatus(jid);
      const d = Array.isArray(status) ? status[0] : status;
      if (d?.status) {
        if (typeof d.status === "object") { bio = d.status.status || null; setAt = d.status.setAt || null; }
        else if (typeof d.status === "string") bio = d.status;
      }
    } catch {}

    let metaBusiness = false;
    try { metaBusiness = !!(await Angkasa.getBusinessProfile(jid)); } catch {}

    res.json({ number: target, registered: true, bio, setAt, metaBusiness, jamPercentage: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.use('/static', express.static(path.join(__dirname, 'public')));

// ========== START SERVER ==========
app.listen(config.portVps, "0.0.0.0", () => {
  console.log(`🌐 Panel Rafael: http://localhost:${config.portVps}`);
});

setInterval(() => autoBackup(), 6 * 60 * 60 * 1000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ========== RUN ==========
(async () => {
  await autoBackup();
  bot.launch();
  startWhatsAppClient();
  console.log('✅ Bot Rafael OTW!');
})();
