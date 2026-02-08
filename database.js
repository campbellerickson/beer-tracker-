const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// Default database structure
const defaultData = {
  users: {},
  invites: {},
  sessions: {},
  drinks: []
};

// Load or initialize database
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading database:', err);
  }
  return { ...defaultData };
}

// Save database
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Database instance
let db = loadDB();

// Ensure drinks array exists
if (!db.drinks) {
  db.drinks = [];
  saveDB(db);
}

// Ensure admin invite exists
if (!db.invites['ADMINBEER']) {
  db.invites['ADMINBEER'] = {
    code: 'ADMINBEER',
    createdBy: null,
    usedBy: null,
    isAdmin: true,
    createdAt: new Date().toISOString()
  };
  saveDB(db);
  console.log('\n========================================');
  console.log('ADMIN INVITE CODE: ADMINBEER');
  console.log('Use this to create the admin account!');
  console.log('========================================\n');
}

module.exports = {
  // Users
  getUser(id) {
    return db.users[id] || null;
  },

  getUserByUsername(username) {
    return Object.values(db.users).find(u => u.username === username) || null;
  },

  createUser(id, username, password, isAdmin = false) {
    db.users[id] = {
      id,
      username,
      password,
      beerCount: 0,
      isAdmin,
      createdAt: new Date().toISOString()
    };
    saveDB(db);
    return db.users[id];
  },

  recordDrink(userId, username, beerType) {
    if (db.users[userId]) {
      db.users[userId].beerCount += 1;
      db.drinks.push({
        id: Date.now().toString(),
        userId,
        username,
        beerType,
        timestamp: new Date().toISOString()
      });
      saveDB(db);
      return db.users[userId].beerCount;
    }
    return 0;
  },

  getLeaderboard() {
    return Object.values(db.users)
      .map(u => ({ username: u.username, beerCount: u.beerCount, isAdmin: u.isAdmin }))
      .sort((a, b) => b.beerCount - a.beerCount);
  },

  getTotalBeers() {
    return Object.values(db.users).reduce((sum, u) => sum + u.beerCount, 0);
  },

  getRecentDrinks(limit = 10) {
    return db.drinks.slice(-limit).reverse();
  },

  // Invites
  getInvite(code) {
    return db.invites[code] || null;
  },

  isInviteValid(code) {
    const invite = db.invites[code];
    return invite && !invite.usedBy;
  },

  useInvite(code, userId) {
    if (db.invites[code]) {
      db.invites[code].usedBy = userId;
      db.invites[code].usedAt = new Date().toISOString();
      saveDB(db);
      return db.invites[code].isAdmin || false;
    }
    return false;
  },

  createInvite(code, createdBy) {
    db.invites[code] = {
      code,
      createdBy,
      usedBy: null,
      isAdmin: false,
      createdAt: new Date().toISOString()
    };
    saveDB(db);
    return db.invites[code];
  },

  // Sessions
  getSession(token) {
    return db.sessions[token] || null;
  },

  createSession(token, userId) {
    db.sessions[token] = {
      token,
      userId,
      createdAt: new Date().toISOString()
    };
    saveDB(db);
    return db.sessions[token];
  },

  deleteSession(token) {
    delete db.sessions[token];
    saveDB(db);
  }
};
