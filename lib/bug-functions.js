// ============================================
// RAFAEL BUG FUNCTIONS
// ============================================
// Setiap function menerima:
//   - sock   : koneksi WhatsApp (Baileys socket)
//   - target : JID WhatsApp tujuan (628xxx@s.whatsapp.net)
//
// ISI KODE BUG ANDA DI SINI.
// ============================================

// ========== BUG UMUM (semua role) ==========
async function bugDelay(sock, target) {
  // ISI BUG DELAY INVISIBLE DI SINI
  console.log("[BUG] delay →", target);
}

async function bugBlank(sock, target) {
  // ISI BUG BLANK ANDROS DI SINI
  console.log("[BUG] blank →", target);
}

async function bugMedium(sock, target) {
  // ISI BUG MEDIUM DI SINI
  console.log("[BUG] medium →", target);
}

async function bugBlankIos(sock, target) {
  // ISI BUG BLANK IOS DI SINI
  console.log("[BUG] blank-ios →", target);
}

async function bugForClose(sock, target) {
  // ISI BUG FOR CLOSE DI SINI
  console.log("[BUG] forClose →", target);
}

// ========== BUG KHUSUS VIP (10 COMMAND) ==========
async function bugVIP1(sock, target) {
  console.log("[VIP-1] →", target);
}

async function bugVIP2(sock, target) {
  console.log("[VIP-2] →", target);
}

async function bugVIP3(sock, target) {
  console.log("[VIP-3] →", target);
}

async function bugVIP4(sock, target) {
  console.log("[VIP-4] →", target);
}

async function bugVIP5(sock, target) {
  console.log("[VIP-5] →", target);
}

async function bugVIP6(sock, target) {
  console.log("[VIP-6] →", target);
}

async function bugVIP7(sock, target) {
  console.log("[VIP-7] →", target);
}

async function bugVIP8(sock, target) {
  console.log("[VIP-8] →", target);
}

async function bugVIP9(sock, target) {
  console.log("[VIP-9] →", target);
}

async function bugVIP10(sock, target) {
  console.log("[VIP-10] →", target);
}

module.exports = {
  bugDelay, bugBlank, bugMedium, bugBlankIos, bugForClose,
  bugVIP1, bugVIP2, bugVIP3, bugVIP4, bugVIP5,
  bugVIP6, bugVIP7, bugVIP8, bugVIP9, bugVIP10
};