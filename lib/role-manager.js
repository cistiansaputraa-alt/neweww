const fs = require('fs');
const path = require('path');
const config = require('../config');

const BUYERS_FILE = path.join(__dirname, '..', 'database', 'buyers.json');
const USERS_FILE = path.join(__dirname, '..', 'database', 'keyapk.json');

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

function canAddGlobalSender(role) {
  return config.canAddGlobalSender.includes(role);
}

function getSenderLimit(role) {
  return config.senderLimits[role] || 0;
}

function getPairingLimit(role) {
  return config.pairingLimits[role] || 1;
}

function registerBuyer(resellerUsername, buyerUsername) {
  const buyers = loadBuyers();
  const existing = buyers.find(b => b.buyer === buyerUsername);
  if (existing) {
    existing.reseller = resellerUsername;
  } else {
    buyers.push({
      reseller: resellerUsername,
      buyer: buyerUsername,
      senders: [],
      created: Date.now()
    });
  }
  saveBuyers(buyers);
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

function addSenderToBuyer(resellerUsername, buyerUsername, senderJid) {
  const buyers = loadBuyers();
  const data = buyers.find(b => b.buyer === buyerUsername && b.reseller === resellerUsername);
  if (!data) return false;
  if (!data.senders) data.senders = [];
  if (!data.senders.includes(senderJid)) {
    data.senders.push(senderJid);
  }
  saveBuyers(buyers);
  return true;
}

function removeSenderFromBuyer(buyerUsername, senderJid) {
  const buyers = loadBuyers();
  const data = buyers.find(b => b.buyer === buyerUsername);
  if (!data) return false;
  data.senders = (data.senders || []).filter(s => s !== senderJid);
  saveBuyers(buyers);
  return true;
}

function getSendersForBuyer(buyerUsername) {
  const data = getBuyerData(buyerUsername);
  return data ? (data.senders || []) : [];
}

module.exports = {
  loadBuyers, saveBuyers,
  roleHigher, canAccess, canAccessTelegram,
  canPairGlobal, canAddGlobalSender,
  getSenderLimit, getPairingLimit,
  registerBuyer, removeBuyer, getBuyerData, getBuyersByReseller,
  addSenderToBuyer, removeSenderFromBuyer, getSendersForBuyer,
  getRoleByTelegramId
};