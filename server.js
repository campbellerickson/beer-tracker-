const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function authenticate(req, res, next) {
  const token = req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = db.getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const user = db.getUser(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = {
    id: user.id,
    username: user.username,
    beer_count: user.beerCount
  };
  next();
}

// Check if invite code is valid
app.get('/api/invite/:code', (req, res) => {
  if (!db.isInviteValid(req.params.code)) {
    return res.status(404).json({ error: 'Invalid or used invite code' });
  }
  res.json({ valid: true });
});

// Register with invite code
app.post('/api/register', (req, res) => {
  const { username, password, inviteCode } = req.body;

  if (!username || !password || !inviteCode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check invite
  if (!db.isInviteValid(inviteCode)) {
    return res.status(400).json({ error: 'Invalid or used invite code' });
  }

  // Check if username exists
  if (db.getUserByUsername(username)) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  const userId = uuidv4();
  const sessionToken = uuidv4();

  try {
    db.createUser(userId, username, password);
    db.useInvite(inviteCode, userId);
    db.createSession(sessionToken, userId);

    res.cookie('session', sessionToken, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, user: { id: userId, username, beer_count: 0 } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = db.getUserByUsername(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const sessionToken = uuidv4();
  db.createSession(sessionToken, user.id);

  res.cookie('session', sessionToken, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({
    success: true,
    user: { id: user.id, username: user.username, beer_count: user.beerCount }
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  const token = req.cookies.session;
  if (token) {
    db.deleteSession(token);
  }
  res.clearCookie('session');
  res.json({ success: true });
});

// Get current user
app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Record a beer
app.post('/api/drink', authenticate, (req, res) => {
  const newCount = db.incrementBeerCount(req.user.id);
  res.json({ success: true, beer_count: newCount });
});

// Get leaderboard and stats
app.get('/api/stats', (req, res) => {
  const leaderboard = db.getLeaderboard();
  const totalUserBeers = db.getTotalBeers();

  const remaining = Math.max(0, 1000000 - totalUserBeers);
  const progress = totalUserBeers;

  res.json({
    leaderboard: leaderboard.map(u => ({ username: u.username, beer_count: u.beerCount })),
    remaining,
    progress,
    goal: 1000000
  });
});

// Create invite (authenticated users only)
app.post('/api/invite', authenticate, (req, res) => {
  const code = uuidv4().slice(0, 8).toUpperCase();
  db.createInvite(code, req.user.id);
  res.json({ code, link: `http://localhost:${PORT}?invite=${code}` });
});

app.listen(PORT, () => {
  console.log(`\nBeer Tracker running at http://localhost:${PORT}\n`);
});
