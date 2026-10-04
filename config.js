module.exports = {
    version: "2.0.0",
    ownerId: 7441136575,
    namaBot: "𝚁𝙰𝙵𝙰𝙴𝙻 𝙰𝙿𝙿𝚂",
    usernameOwner: "@bronsew",
    telegramBotToken: "8990974375:AAHsQYjkmmQ5Gzsb7avbyCfbNmgaZTaJUBA",
    sessionName: "session",
    portVps: process.env.PORT || "1314",
    ipVps: "http://localhost:1314",

    // ============================================
    // MEDIA BOT TELEGRAM (PISAH BIAR GAMPANG GANTI)
    // ============================================
    telegramMedia: {
        startPhoto: "https://ibb.co.com/4Zz5G86T",
        menuPhoto: "https://ibb.co.com/4Zz5G86T",
        ownerPhoto: "https://ibb.co.com/4Zz5G86T"
    },

    // ============================================
    // MEDIA PANEL WEB
    // ============================================
    media: {
        type: "image",
        url: "https://files.catbox.moe/i90url.jpg"
    },

    cooldown: {
        global: 25,
        private: 15
    },

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

    telegramAccess: [
        "developer",
        "owner",
        "admin",
        "partner",
        "moderator",
        "reseller"
    ],

    // ============================================
    // BATAS SESSION (= SENDER) PER ROLE
    // ============================================
    sessionLimits: {
        developer: 999,
        owner: 100,
        admin: 50,
        partner: 20,
        moderator: 10,
        reseller: 5,
        VIP: 5,
        buyer: 1
    },

    // ============================================
    // SIAPA YANG BISA PAIRING GLOBAL
    // (session bisa dipakai role di bawah)
    // ============================================
    canPairGlobal: ["developer", "owner", "admin", "partner", "moderator", "reseller"],

    // ============================================
    // SIAPA YANG BISA PAIRING PRIVATE
    // (session cuma dipakai sendiri)
    // ============================================
    canPairPrivate: ["developer", "owner", "admin", "partner", "moderator", "reseller", "VIP", "buyer"],

    // ============================================
    // SIAPA YANG BISA ASSIGN SESSION KE BUYER
    // (reseller assign session-nya ke VIP/buyer)
    // ============================================
    canAssignSender: ["developer", "owner", "admin", "partner", "moderator", "reseller"],

    menuAccess: {
        pairing: ["developer", "owner", "admin", "partner", "moderator", "reseller", "VIP", "buyer"],
        pairingGlobal: ["developer", "owner", "admin", "partner", "moderator", "reseller"],
        assignSender: ["developer", "owner", "admin", "partner", "moderator", "reseller"],
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