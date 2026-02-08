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

  // Show admin badge if admin
  const adminBadge = document.getElementById('admin-badge');
  if (currentUser.is_admin) {
    adminBadge.classList.remove('hidden');
  } else {
    adminBadge.classList.add('hidden');
  }

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

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
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

    // Update recent drinks
    const recentDrinks = document.getElementById('recent-drinks');
    if (data.recentDrinks && data.recentDrinks.length > 0) {
      recentDrinks.innerHTML = data.recentDrinks.map(drink => `
        <div class="recent-drink">
          <div class="recent-drink-info">
            <span class="recent-drink-user">${drink.username.toUpperCase()}</span>
            <span class="recent-drink-beer">"${drink.beerType}"</span>
          </div>
          <div class="recent-drink-time">${formatTime(drink.timestamp)}</div>
        </div>
      `).join('');
    } else {
      recentDrinks.innerHTML = '<div class="recent-drink"><div class="recent-drink-info">No drinks yet!</div></div>';
    }

    // Update leaderboard
    const leaderboard = document.getElementById('leaderboard');
    leaderboard.innerHTML = data.leaderboard.map((player, i) => {
      let rankClass = '';
      if (i === 0) rankClass = 'gold';
      else if (i === 1) rankClass = 'silver';
      else if (i === 2) rankClass = 'bronze';

      const isYou = currentUser && player.username === currentUser.username;
      const adminTag = player.is_admin ? ' <span style="color:#ffd700;font-size:0.8em;">[ADMIN]</span>' : '';

      return `
        <div class="leaderboard-row" style="${isYou ? 'background: rgba(255, 107, 0, 0.2);' : ''}">
          <div class="leaderboard-rank ${rankClass}">#${i + 1}</div>
          <div class="leaderboard-name">${player.username.toUpperCase()}${adminTag}${isYou ? ' (YOU)' : ''}</div>
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

let selectedPhoto = null;

function handlePhotoSelect(input) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedPhoto = e.target.result;
      document.getElementById('preview-img').src = selectedPhoto;
      document.getElementById('photo-preview').classList.remove('hidden');
      document.getElementById('photo-icon').textContent = '✓';
      document.getElementById('photo-text').textContent = 'PHOTO READY';
    };
    reader.readAsDataURL(file);
  }
}

function clearPhoto() {
  selectedPhoto = null;
  document.getElementById('beer-photo').value = '';
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('photo-icon').textContent = '📷';
  document.getElementById('photo-text').textContent = 'SNAP YOUR BEER';
}

function showVerificationStatus(status, message) {
  const statusEl = document.getElementById('verification-status');
  statusEl.className = 'verification-status ' + status;
  statusEl.textContent = message;
  statusEl.classList.remove('hidden');
}

function hideVerificationStatus() {
  document.getElementById('verification-status').classList.add('hidden');
}

async function drinkBeer() {
  const beerType = document.getElementById('beer-type').value.trim();

  if (!beerType) {
    alert('Please enter what beer you\'re drinking!');
    document.getElementById('beer-type').focus();
    return;
  }

  if (!selectedPhoto) {
    alert('Please take a photo of your beer for verification!');
    return;
  }

  const btn = document.getElementById('drink-btn');
  btn.classList.add('drink-animation');
  btn.disabled = true;

  showVerificationStatus('verifying', 'AI IS VERIFYING YOUR BEER...');

  try {
    const res = await fetch('/api/drink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beerType, photo: selectedPhoto })
    });
    const data = await res.json();

    if (res.ok) {
      if (data.verified) {
        showVerificationStatus('success', 'BEER VERIFIED! ' + (data.verificationMessage || ''));
        currentUser.beer_count = data.beer_count;
        document.getElementById('your-beers').textContent = data.beer_count;
        document.getElementById('beer-type').value = '';
        clearPhoto();

        // Show AI roast if available
        if (data.aiRoast) {
          setTimeout(() => showRoast(data.aiRoast), 1500);
        }

        loadStats();
        setTimeout(hideVerificationStatus, 3000);
      } else {
        showVerificationStatus('failed', data.verificationMessage || 'NOT A BEER! NICE TRY.');
        setTimeout(hideVerificationStatus, 5000);
      }
    } else {
      showVerificationStatus('failed', data.error || 'Failed to verify');
      setTimeout(hideVerificationStatus, 5000);
    }
  } catch (err) {
    console.error('Failed to record drink', err);
    showVerificationStatus('failed', 'ERROR VERIFYING');
    setTimeout(hideVerificationStatus, 3000);
  }

  btn.disabled = false;
  setTimeout(() => btn.classList.remove('drink-animation'), 300);
}

function showRoast(roast) {
  // Create roast popup
  const popup = document.createElement('div');
  popup.className = 'roast-popup';
  popup.innerHTML = `
    <div class="roast-content">
      <div class="roast-icon">&#129312;</div>
      <div class="roast-text">${roast}</div>
    </div>
  `;
  document.body.appendChild(popup);

  // Remove after 5 seconds
  setTimeout(() => {
    popup.classList.add('fade-out');
    setTimeout(() => popup.remove(), 500);
  }, 5000);
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

// Allow Enter key to submit beer
document.getElementById('beer-type').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') drinkBeer();
});
