module.exports = {
    version: "2.0.0",
    ownerId: 1234567890,
    namaBot: "𝚁𝙰𝙵𝙰𝙴𝙻 𝙰𝙿𝙿𝚂",
    usernameOwner: "@bronsew",
    telegramBotToken: "7806483616:AAFsP6eCJw8b3yI92_n0QEhKe0p8KZvY1KA",
    sessionName: "session",
    portVps: process.env.PORT || "1314",
    ipVps: "http://localhost:1314",

    // ============================================
    // MEDIA BOT TELEGRAM (PISAH BIAR GAMPANG GANTI)
    // ============================================
    telegramMedia: {
        // Foto untuk pesan /start
        startPhoto: "https://ibb.co.com/4Zz5G86T",
        // Foto untuk menu utama
        menuPhoto: "https://ibb.co.com/4Zz5G86T",
        // Foto untuk menu owner
        ownerPhoto: "https://ibb.co.com/4Zz5G86T"
    },

    // ============================================
    // MEDIA PANEL WEB
    // ============================================
    media: {
        type: "image",
        url: "https://files.catbox.moe/i90url.jpg"
    },

    // ============================================
    // COOLDOWN BUG (detik)
    // ============================================
    cooldown: {
        global: 25,
        private: 15
    },

    // ============================================
    // URUTAN ROLE (tinggi ke rendah)
    // ============================================
    roleOrder: [
        "developer",
        "owner",
        "admin",
        "partner",
        "moderator",
        "reseller",
        "VIP",
        "buyer"
    ],

    // ============================================
    // SIAPA YANG BISA AKSES BOT TELEGRAM
    // (cuma reseller ke atas)
    // ============================================
    telegramAccess: [
        "developer",
        "owner",
        "admin",
        "partner",
        "moderator",
        "reseller"
    ],

    // ============================================
    // BATAS SENDER GLOBAL PER ROLE
    // ============================================
    senderLimits: {
        developer: 999,
        owner: 100,
        admin: 50,
        partner: 20,
        moderator: 10,
        reseller: 3,
        VIP: 0,
        buyer: 0
    },

    // ============================================
    // BATAS NOMOR PAIRING PER ROLE
    // ============================================
    pairingLimits: {
        developer: 999,
        owner: 999,
        admin: 50,
        partner: 20,
        moderator: 10,
        reseller: 5,
        VIP: 5,
        buyer: 1
    },

    canPairGlobal: ["developer", "owner", "admin", "partner", "moderator", "reseller"],
    canAddGlobalSender: ["developer", "owner", "admin", "partner", "moderator", "reseller"],

    menuAccess: {
        pairing: ["developer", "owner", "admin", "partner", "moderator", "reseller", "VIP", "buyer"],
        pairingGlobal: ["developer", "owner", "admin", "partner", "moderator", "reseller"],
        senderGlobal: ["developer", "owner", "admin", "partner", "moderator", "reseller"],
        manageBuyer: ["developer", "owner", "admin", "partner", "moderator", "reseller"],
        bugVIP: ["developer", "owner", "admin", "partner", "moderator", "reseller", "VIP"]
    },

    message: {
        owner: "🚫 Khusus Owner!",
        wait: "⏳ Tunggu sebentar...",
        error: "⚠️ Error. Coba lagi nanti.",
        waNotConnected: "⚠️ WhatsApp belum connect. Buka menu Pairing."
    },

    settings: {
        namabot: "Rafael Apps",
        footer: "Powered By bronsew"
    }
};