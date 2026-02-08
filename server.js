const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const OpenAI = require('openai');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

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
          content: `You are an EXTREMELY strict beer verification AI. Your job is to look at photos and determine if they CLEARLY show an actual beer, wine, or alcoholic beverage that someone is about to drink or is drinking.

BE SKEPTICAL. If you're not 100% sure it's an actual alcoholic drink, REJECT IT.

REJECT if:
- It's not clearly a beer/wine/alcoholic drink
- It's just a random object, person, or scene
- It's a picture of something else entirely
- It's blurry and you can't tell what it is
- It looks like someone is trying to cheat

APPROVE only if:
- You can clearly see a beer bottle, can, glass, or pint
- You can clearly see wine in a glass or bottle
- You can clearly see a cocktail or mixed drink
- It's obviously an alcoholic beverage

Respond with JSON: {"isBeer": true/false, "message": "your response"}

IMPORTANT: Your message MUST explain what you actually see in the photo.
- If APPROVING: Give a short fun comment like "Cheers! That IPA looks refreshing."
- If REJECTING: State what you see and why it's not a beer. Be snarky but informative.
  Examples: "That's a desk lamp, not a lager." or "I see your cat, but cats aren't cocktails." or "This is a blurry mess - show me an actual drink!" or "Nice ceiling fan, but I need to see a beer."`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `The user claims this is a "${claimedBeerType}". Is this ACTUALLY a beer or alcoholic beverage? Be skeptical!`
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
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // Default to rejection if can't parse
    return { isBeer: false, message: "Couldn't verify this. Try again with a clearer photo of your beer!" };
  } catch (err) {
    console.error('Vision API error:', err.message);
    // On error, reject instead of allowing
    return { isBeer: false, message: "Verification failed. Try again!" };
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

// Async auth middleware
async function authenticate(req, res, next) {
  const token = req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const session = await db.getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const user = await db.getUser(session.user_id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      beer_count: user.beer_count,
      is_admin: user.is_admin || false
    };
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Check if invite code is valid
app.get('/api/invite/:code', async (req, res) => {
  try {
    const valid = await db.isInviteValid(req.params.code);
    if (!valid) {
      return res.status(404).json({ error: 'Invalid or used invite code' });
    }
    res.json({ valid: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Register with invite code
app.post('/api/register', async (req, res) => {
  const { username, password, inviteCode } = req.body;

  if (!username || !password || !inviteCode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const valid = await db.isInviteValid(inviteCode);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid or used invite code' });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const userId = uuidv4();
    const sessionToken = uuidv4();

    // Get admin status before using invite
    const invite = await db.getInvite(inviteCode);
    const isAdmin = invite?.is_admin || false;

    // Create user first, then mark invite as used
    await db.createUser(userId, username, password, isAdmin);
    await db.useInvite(inviteCode, userId);
    await db.createSession(sessionToken, userId);

    res.cookie('session', sessionToken, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true, user: { id: userId, username, beer_count: 0, is_admin: isAdmin } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await db.getUserByUsername(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionToken = uuidv4();
    await db.createSession(sessionToken, user.id);

    res.cookie('session', sessionToken, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({
      success: true,
      user: { id: user.id, username: user.username, beer_count: user.beer_count, is_admin: user.is_admin || false }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/logout', async (req, res) => {
  const token = req.cookies.session;
  if (token) {
    await db.deleteSession(token);
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

  try {
    const verification = await verifyBeerPhoto(photo, beerType.trim());

    if (!verification.isBeer) {
      return res.json({
        success: false,
        verified: false,
        verificationMessage: verification.message || "That doesn't look like a beer!"
      });
    }

    const newCount = await db.recordDrink(req.user.id, req.user.username, beerType.trim());
    const totalBeers = await db.getTotalBeers();
    const remaining = Math.max(0, 1000000 - totalBeers);

    const aiRoast = await generateRoast(req.user.username, beerType.trim(), newCount, remaining);

    res.json({
      success: true,
      verified: true,
      verificationMessage: verification.message,
      beer_count: newCount,
      aiRoast
    });
  } catch (err) {
    console.error('Drink error:', err);
    res.status(500).json({ error: 'Failed to record drink' });
  }
});

// Get leaderboard and stats
app.get('/api/stats', async (req, res) => {
  try {
    const leaderboard = await db.getLeaderboard();
    const totalUserBeers = await db.getTotalBeers();
    const recentDrinks = await db.getRecentDrinks(10);

    const remaining = Math.max(0, 1000000 - totalUserBeers);
    const progress = totalUserBeers;

    res.json({
      leaderboard: leaderboard.map(u => ({
        username: u.username,
        beer_count: u.beer_count,
        is_admin: u.is_admin || false
      })),
      recentDrinks: recentDrinks.map(d => ({
        username: d.username,
        beerType: d.beer_type,
        timestamp: d.timestamp
      })),
      remaining,
      progress,
      goal: 1000000
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Admin reset - clear all progress
app.post('/api/admin/reset', authenticate, async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    await db.resetAllProgress();
    res.json({ success: true, message: 'All progress has been reset' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Failed to reset progress' });
  }
});

// Create invite (authenticated users only)
app.post('/api/invite', authenticate, async (req, res) => {
  try {
    const code = uuidv4().slice(0, 8).toUpperCase();
    await db.createInvite(code, req.user.id);
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${PORT}`;
    // Include sharer's username in the invite link
    res.json({ code, link: `${baseUrl}?invite=${code}&ref=${encodeURIComponent(req.user.username)}` });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// Only start server if not in Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\nBeer Tracker running at http://localhost:${PORT}\n`);
  });
}

module.exports = app;
