module.exports = {
    version: "2.0.0",
    ownerId: 7441136575,
    namaBot: "𝚁𝙰𝙵𝙰𝙴𝙻 𝙱𝙾𝚃",
    usernameOwner: "@rafael_dev",
    telegramBotToken: "7806483616:AAFsP6eCJw8b3yI92_n0QEhKe0p8KZvY1KA",
    sessionName: "session",
    portVps: process.env.PORT || "1314",
    ipVps: "http://localhost:1314",

    media: {
        type: "image",
        url: "https://ibb.co.com/BHnwW7hp"
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
        namabot: "Rafael Panel",
        footer: "Powered By Rafael"
    }
};