// State
let currentUser = null;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');

// Check for invite code in URL
window.addEventListener('load', async () => {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get('invite');

  if (inviteCode) {
    document.getElementById('invite-code').value = inviteCode;
    showRegister();
  }

  // Check if already logged in
  await checkAuth();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      showDashboard();
    }
  } catch (err) {
    console.log('Not authenticated');
  }
}

function showLogin() {
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  authError.classList.add('hidden');
}

function showRegister() {
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  authError.classList.add('hidden');
}

function showError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showError('Please fill in all fields');
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      showDashboard();
    } else {
      showError(data.error);
    }
  } catch (err) {
    showError('Login failed');
  }
}

async function register() {
  const inviteCode = document.getElementById('invite-code').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!inviteCode || !username || !password) {
    showError('Please fill in all fields');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode, username, password })
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      // Clear URL params
      window.history.replaceState({}, '', '/');
      showDashboard();
    } else {
      showError(data.error);
    }
  } catch (err) {
    showError('Registration failed');
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  authScreen.classList.remove('hidden');
  dashboardScreen.classList.add('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  showLogin();
}

function showDashboard() {
  authScreen.classList.add('hidden');
  dashboardScreen.classList.remove('hidden');
  document.getElementById('player-name').textContent = currentUser.username.toUpperCase();
  document.getElementById('your-beers').textContent = currentUser.beer_count;
  loadStats();
}

function updateCounter(total) {
  const counterEl = document.getElementById('mega-counter');
  const numStr = total.toString().padStart(7, '0');

  // Format with comma: 999,999 -> ['9','9','9',',','9','9','9']
  const formatted = numStr.slice(0, 1) + ',' + numStr.slice(1, 4) + ',' + numStr.slice(4);
  const digits = formatted.split('');

  counterEl.innerHTML = digits.map(d => {
    if (d === ',') {
      return `<span class="digit" style="background:none;border:none;padding:10px 5px;min-width:auto;color:#888899;text-shadow:none;">,</span>`;
    }
    return `<span class="digit">${d}</span>`;
  }).join('');
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    // Count DOWN from 1,000,000
    updateCounter(data.remaining);

    // Update progress bar (fills as we drink more)
    const percentage = (data.progress / data.goal) * 100;
    document.getElementById('goal-fill').style.width = `${Math.min(percentage, 100)}%`;
    document.getElementById('progress').textContent = data.progress.toLocaleString();

    // Update leaderboard
    const leaderboard = document.getElementById('leaderboard');
    leaderboard.innerHTML = data.leaderboard.map((player, i) => {
      let rankClass = '';
      if (i === 0) rankClass = 'gold';
      else if (i === 1) rankClass = 'silver';
      else if (i === 2) rankClass = 'bronze';

      const isYou = currentUser && player.username === currentUser.username;

      return `
        <div class="leaderboard-row" style="${isYou ? 'background: rgba(255, 107, 0, 0.2);' : ''}">
          <div class="leaderboard-rank ${rankClass}">#${i + 1}</div>
          <div class="leaderboard-name">${player.username.toUpperCase()}${isYou ? ' (YOU)' : ''}</div>
          <div class="leaderboard-score">${player.beer_count.toLocaleString()}</div>
        </div>
      `;
    }).join('');

    if (data.leaderboard.length === 0) {
      leaderboard.innerHTML = '<div class="leaderboard-row"><div class="leaderboard-name">No players yet!</div></div>';
    }
  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

async function drinkBeer() {
  const btn = document.getElementById('drink-btn');
  btn.classList.add('drink-animation');

  try {
    const res = await fetch('/api/drink', { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      currentUser.beer_count = data.beer_count;
      document.getElementById('your-beers').textContent = data.beer_count;
      loadStats();
    }
  } catch (err) {
    console.error('Failed to record drink', err);
  }

  setTimeout(() => btn.classList.remove('drink-animation'), 300);
}

async function generateInvite() {
  try {
    const res = await fetch('/api/invite', { method: 'POST' });
    const data = await res.json();

    document.getElementById('invite-link').value = data.link;
    document.getElementById('invite-modal').classList.remove('hidden');
  } catch (err) {
    console.error('Failed to generate invite', err);
  }
}

function copyInvite() {
  const input = document.getElementById('invite-link');
  input.select();
  document.execCommand('copy');
  alert('Invite link copied!');
}

function closeInviteModal() {
  document.getElementById('invite-modal').classList.add('hidden');
}

// Auto-refresh stats every 5 seconds
setInterval(() => {
  if (currentUser) {
    loadStats();
  }
}, 5000);

// Allow Enter key to submit forms
document.getElementById('login-password').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') login();
});

document.getElementById('reg-password').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') register();
});
