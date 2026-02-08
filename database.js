const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// Default database structure
const defaultData = {
  users: {},
  invites: {},
  sessions: {},
  globalStats: {
    startingCount: 999999
  }
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

// Ensure first invite exists
if (!db.invites['FIRSTBEER']) {
  db.invites['FIRSTBEER'] = {
    code: 'FIRSTBEER',
    createdBy: null,
    usedBy: null,
    createdAt: new Date().toISOString()
  };
  saveDB(db);
  console.log('\n========================================');
  console.log('FIRST INVITE CODE: FIRSTBEER');
  console.log('Use this to create the first account!');
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

  createUser(id, username, password) {
    db.users[id] = {
      id,
      username,
      password,
      beerCount: 0,
      createdAt: new Date().toISOString()
    };
    saveDB(db);
    return db.users[id];
  },

  incrementBeerCount(userId) {
    if (db.users[userId]) {
      db.users[userId].beerCount += 1;
      saveDB(db);
      return db.users[userId].beerCount;
    }
    return 0;
  },

  getLeaderboard() {
    return Object.values(db.users)
      .map(u => ({ username: u.username, beerCount: u.beerCount }))
      .sort((a, b) => b.beerCount - a.beerCount);
  },

  getTotalBeers() {
    return Object.values(db.users).reduce((sum, u) => sum + u.beerCount, 0);
  },

  getStartingCount() {
    return db.globalStats.startingCount;
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
    }
  },

  createInvite(code, createdBy) {
    db.invites[code] = {
      code,
      createdBy,
      usedBy: null,
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
