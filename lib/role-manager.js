const fs = require('fs');
const path = require('path');
const config = require('../config');

const BUYERS_FILE = path.join(__dirname, '..', 'database', 'buyers.json');
const USERS_FILE = path.join(__dirname, '..', 'database', 'keyapk.json');

// ============================================
// LOAD & SAVE
// ============================================
function loadBuyers() {
  try {
    const raw = fs.readFileSync(BUYERS_FILE, 'utf8');
    return raw.trim() ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveBuyers(data) {
  fs.writeFileSync(BUYERS_FILE, JSON.stringify(data, null, 2));
}

function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return raw.trim() ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ============================================
// ROLE HELPER
// ============================================
function getRoleByTelegramId(telegramId) {
  const users = loadUsers();
  const u = users.find(x => x.telegramId === telegramId.toString());
  return u ? u.role : null;
}

function roleHigher(roleA, roleB) {
  const a = config.roleOrder.indexOf(roleA);
  const b = config.roleOrder.indexOf(roleB);
  if (a === -1 || b === -1) return false;
  return a < b;
}

function canAccess(role, feature) {
  const allowed = config.menuAccess[feature] || [];
  return allowed.includes(role);
}

function canAccessTelegram(role) {
  return config.telegramAccess.includes(role);
}

function canPairGlobal(role) {
  return config.canPairGlobal.includes(role);
}

function canPairPrivate(role) {
  return config.canPairPrivate.includes(role);
}

function canAssignSender(role) {
  return config.canAssignSender.includes(role);
}

function getSessionLimit(role) {
  return config.sessionLimits[role] || 0;
}

// ============================================
// STRUKTUR DATA BUYERS:
// {
//   reseller: "reseller1",          // yang nanggung
//   buyer: "vip1",                  // yang ditanggung
//   role_buyer: "VIP",              // role buyer
//   assigned_senders: [             // session JID yang di-assign
//     "628xxx@s.whatsapp.net"
//   ],
//   created: 1699999999
// }
// ============================================

function registerBuyer(resellerUsername, buyerUsername) {
  const buyers = loadBuyers();
  const users = loadUsers();
  const buyerUser = users.find(u => u.username === buyerUsername);
  if (!buyerUser) return false;

  const existing = buyers.find(b => b.buyer === buyerUsername);
  if (existing) {
    existing.reseller = resellerUsername;
    existing.role_buyer = buyerUser.role;
  } else {
    buyers.push({
      reseller: resellerUsername,
      buyer: buyerUsername,
      role_buyer: buyerUser.role,
      assigned_senders: [],
      created: Date.now()
    });
  }
  saveBuyers(buyers);
  return true;
}

function removeBuyer(buyerUsername) {
  let buyers = loadBuyers();
  buyers = buyers.filter(b => b.buyer !== buyerUsername);
  saveBuyers(buyers);
}

function getBuyerData(buyerUsername) {
  const buyers = loadBuyers();
  return buyers.find(b => b.buyer === buyerUsername) || null;
}

function getBuyersByReseller(resellerUsername) {
  const buyers = loadBuyers();
  return buyers.filter(b => b.reseller === resellerUsername);
}

// ============================================
// ASSIGN SESSION KE BUYER
// (reseller assign session-nya ke VIP/buyer)
// ============================================
function assignSenderToBuyer(resellerUsername, buyerUsername, senderJid) {
  const buyers = loadBuyers();
  const data = buyers.find(b => b.buyer === buyerUsername && b.reseller === resellerUsername);
  if (!data) return false;
  if (!data.assigned_senders) data.assigned_senders = [];
  if (!data.assigned_senders.includes(senderJid)) {
    data.assigned_senders.push(senderJid);
  }
  saveBuyers(buyers);
  return true;
}

function unassignSenderFromBuyer(buyerUsername, senderJid) {
  const buyers = loadBuyers();
  const data = buyers.find(b => b.buyer === buyerUsername);
  if (!data) return false;
  data.assigned_senders = (data.assigned_senders || []).filter(s => s !== senderJid);
  saveBuyers(buyers);
  return true;
}

// ============================================
// AMBIL SENDER YANG DI-ASSIGN KE BUYER
// ============================================
function getAssignedSendersForBuyer(buyerUsername) {
  const data = getBuyerData(buyerUsername);
  return data ? (data.assigned_senders || []) : [];
}

// ============================================
// CEK APAKAH SESSION BOLEH DIPAKAI USER
// ============================================
// Rules:
// 1. Session milik sendiri → boleh
// 2. Session global → boleh kalau role di atas buyer (developer/owner/admin/partner/moderator/reseller)
// 3. Session yang di-assign → boleh kalau user adalah target assign
// 4. Selain itu → tolak
// ============================================
function canUseSender(username, role, sessionData) {
  if (!sessionData) return false;

  // 1. Milik sendiri
  if (sessionData.owner === username) return true;

  // 2. Global (kecuali VIP & buyer)
  if (sessionData.type === 'global') {
    if (role === 'VIP' || role === 'buyer') return false;
    return true;
  }

  // 3. Assigned
  if (sessionData.assignedTo && sessionData.assignedTo.includes(username)) {
    return true;
  }

  // 4. Cek via buyers.json
  const assignedFromBuyers = getAssignedSendersForBuyer(username);
  if (assignedFromBuyers.includes(sessionData.senderJid)) {
    return true;
  }

  return false;
}

// ============================================
// AMBIL SEMUA BUYER DI BAWAH RESELLER
// ============================================
function getBuyersByRole(resellerUsername, role) {
  const buyers = loadBuyers();
  return buyers.filter(b => b.reseller === resellerUsername && b.role_buyer === role);
}

module.exports = {
  loadBuyers, saveBuyers,
  roleHigher, canAccess, canAccessTelegram,
  canPairGlobal, canPairPrivate, canAssignSender,
  getSessionLimit,
  registerBuyer, removeBuyer, getBuyerData, getBuyersByReseller,
  assignSenderToBuyer, unassignSenderFromBuyer,
  getAssignedSendersForBuyer,
  canUseSender,
  getBuyersByRole,
  getRoleByTelegramId
};