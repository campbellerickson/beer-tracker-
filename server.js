const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const OpenAI = require('openai');
const db = require('./database');

const app = express();
const PORT = 3000;

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Verify beer photo with GPT-4 Vision
async function verifyBeerPhoto(photoBase64, claimedBeerType) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a beer verification AI. Your job is to look at photos and determine if they show a beer/alcoholic beverage. Be somewhat lenient - if it looks like any kind of beer, cider, or alcoholic drink, approve it. Respond with JSON: {"isBeer": true/false, "message": "short funny comment about what you see"}'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `The user claims this is a "${claimedBeerType}". Is this actually a beer or alcoholic beverage? Be fun about it!`
            },
            {
              type: 'image_url',
              image_url: {
                url: photoBase64
              }
            }
          ]
        }
      ],
      max_tokens: 150
    });

    const content = response.choices[0].message.content;
    // Try to parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // Fallback: if it mentions beer positively, approve
    const isBeer = content.toLowerCase().includes('yes') || content.toLowerCase().includes('beer') && !content.toLowerCase().includes('not');
    return { isBeer, message: content };
  } catch (err) {
    console.error('Vision API error:', err.message);
    // On error, be lenient and allow it
    return { isBeer: true, message: "Couldn't verify but I trust you!" };
  }
}

// Generate a snarky AI roast
async function generateRoast(username, beerType, beerCount, remaining) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a snarky bartender AI. Generate a SHORT (1-2 sentences max) funny, roast-style comment about someone logging a beer. Be playful and teasing but not mean. Include the beer type and/or their drink count in the joke. Keep it PG-13.'
        },
        {
          role: 'user',
          content: `${username} just logged their beer #${beerCount}: "${beerType}". There are ${remaining.toLocaleString()} beers left until the group hits 1 million. Roast them!`
        }
      ],
      max_tokens: 100,
      temperature: 0.9
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.error('OpenAI error:', err.message);
    return null;
  }
}

app.use(express.json({ limit: '10mb' }));
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
    beer_count: user.beerCount,
    is_admin: user.isAdmin || false
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
    // Use invite and check if it grants admin
    const isAdmin = db.useInvite(inviteCode, userId);
    db.createUser(userId, username, password, isAdmin);
    db.createSession(sessionToken, userId);

    res.cookie('session', sessionToken, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, user: { id: userId, username, beer_count: 0, is_admin: isAdmin } });
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
    user: { id: user.id, username: user.username, beer_count: user.beerCount, is_admin: user.isAdmin || false }
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

// Record a beer with type and photo verification
app.post('/api/drink', authenticate, async (req, res) => {
  const { beerType, photo } = req.body;

  if (!beerType || !beerType.trim()) {
    return res.status(400).json({ error: 'Beer type is required' });
  }

  if (!photo) {
    return res.status(400).json({ error: 'Photo is required for verification' });
  }

  // Verify the photo is actually a beer
  const verification = await verifyBeerPhoto(photo, beerType.trim());

  if (!verification.isBeer) {
    return res.json({
      success: false,
      verified: false,
      verificationMessage: verification.message || "That doesn't look like a beer!"
    });
  }

  const newCount = db.recordDrink(req.user.id, req.user.username, beerType.trim());
  const totalBeers = db.getTotalBeers();
  const remaining = Math.max(0, 1000000 - totalBeers);

  // Generate AI roast
  const aiRoast = await generateRoast(req.user.username, beerType.trim(), newCount, remaining);

  res.json({
    success: true,
    verified: true,
    verificationMessage: verification.message,
    beer_count: newCount,
    aiRoast
  });
});

// Get leaderboard and stats
app.get('/api/stats', (req, res) => {
  const leaderboard = db.getLeaderboard();
  const totalUserBeers = db.getTotalBeers();
  const recentDrinks = db.getRecentDrinks(10);

  const remaining = Math.max(0, 1000000 - totalUserBeers);
  const progress = totalUserBeers;

  res.json({
    leaderboard: leaderboard.map(u => ({
      username: u.username,
      beer_count: u.beerCount,
      is_admin: u.isAdmin || false
    })),
    recentDrinks,
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
