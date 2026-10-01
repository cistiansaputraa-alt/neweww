// modules/roles.js
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../database/roles.json");

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
}

function loadDB() {
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveDB(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const ROLE_ORDER = ["buyer", "admin", "seller", "owner", "partner", "developer"];

const CAN_ADD = {
    developer: ["partner", "owner", "seller", "admin", "buyer"],
    partner:   ["owner", "seller", "admin", "buyer"],
    owner:     ["seller", "admin", "buyer"],
    seller:    ["admin", "buyer"],
    admin:     ["buyer"],
    buyer:     []
};

function getRole(userId) {
    const db = loadDB();
    return db.users[userId]?.role || null;
}

function userExists(userId) {
    const db = loadDB();
    return !!db.users[userId];
}

function createUser({ userId, username, password, role, createdBy, expired=0 }) {
    const db = loadDB();
    db.users[userId] = {
        role,
        createdBy,
        username,
        password,
        expired
    };
    saveDB(db);
}

function getUser(userId) {
    const db = loadDB();
    return db.users[userId] || null;
}

function getUsersCreatedBy(id) {
    const db = loadDB();
    return Object.entries(db.users)
        .filter(([uid, data]) => data.createdBy === id)
        .map(([uid, data]) => ({ id: uid, ...data }));
}

function getAllUsers() {
    const db = loadDB();
    return Object.entries(db.users).map(([id, data]) => ({ id, ...data }));
}

function deleteUser(userId) {
    const db = loadDB();
    if (db.users[userId]) {
        delete db.users[userId];
        saveDB(db);
        return true;
    }
    return false;
}

function updateUser(userId, fields = {}) {
    const db = loadDB();
    if (!db.users[userId]) return false;
    db.users[userId] = { ...db.users[userId], ...fields };
    saveDB(db);
    return true;
}

function canAddRole(fromRole, toRole) {
    return CAN_ADD[fromRole]?.includes(toRole);
}

function getGroup() {
    const db = loadDB();
    return db.group || null;
}

function setGroup(id) {
    const db = loadDB();
    db.group = id;
    saveDB(db);
}

module.exports = {
    getRole,
    createUser,
    getUser,
    getUsersCreatedBy,
    getAllUsers,
    canAddRole,
    userExists,
    deleteUser,
    updateUser,
    CAN_ADD,
    ROLE_ORDER,
    getGroup,
    setGroup
};