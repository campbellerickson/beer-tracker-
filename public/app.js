// State
let currentUser = null;
let countdownInterval = null;

// Launch date: Midnight PT tonight (or next midnight if already past)
function getLaunchTime() {
  // Get current time in PT
  const now = new Date();
  const ptOptions = { timeZone: 'America/Los_Angeles' };
  const ptString = now.toLocaleString('en-US', ptOptions);
  const ptNow = new Date(ptString);

  // Set to midnight PT tonight
  const launch = new Date(ptString);
  launch.setHours(24, 0, 0, 0); // Next midnight

  // Convert back to UTC for comparison
  const launchUTC = new Date(launch.toLocaleString('en-US', { timeZone: 'UTC' }));

  // Adjust for PT offset (roughly -8 hours, but this handles DST)
  const ptOffset = now.getTime() - new Date(ptString).getTime();
  return new Date(launch.getTime() + ptOffset);
}

// Hardcoded launch: February 8, 2026 at 12:00 AM PT (midnight)
const LAUNCH_DATE = new Date('2026-02-08T08:00:00.000Z'); // Midnight PT = 8 AM UTC

function checkCountdown() {
  const now = new Date();
  const timeLeft = LAUNCH_DATE - now;

  if (timeLeft <= 0) {
    // Launch time has passed - hide countdown, show app
    document.getElementById('countdown-overlay').classList.add('hidden');
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    return false; // Not in countdown
  }

  // Show countdown
  document.getElementById('countdown-overlay').classList.remove('hidden');

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  document.getElementById('countdown-hours').textContent = hours.toString().padStart(2, '0');
  document.getElementById('countdown-minutes').textContent = minutes.toString().padStart(2, '0');
  document.getElementById('countdown-seconds').textContent = seconds.toString().padStart(2, '0');

  return true; // In countdown
}

// Start countdown check
function startCountdown() {
  if (checkCountdown()) {
    countdownInterval = setInterval(() => {
      if (!checkCountdown()) {
        // Countdown finished - reload to show the app
        window.location.reload();
      }
    }, 1000);
  }
}

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');

// Check for invite code in URL
window.addEventListener('load', async () => {
  // Check if we're still in countdown mode
  startCountdown();

  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get('invite');
  const referrer = params.get('ref');

  if (inviteCode) {
    document.getElementById('invite-code').value = inviteCode;
    showRegister();

    // Show who invited them
    if (referrer) {
      showReferrer(referrer);
    }
  }

  // Check if already logged in
  await checkAuth();
});

function showReferrer(username) {
  const registerForm = document.getElementById('register-form');
  const existingBanner = registerForm.querySelector('.referrer-banner');
  if (existingBanner) existingBanner.remove();

  const banner = document.createElement('div');
  banner.className = 'referrer-banner';
  banner.innerHTML = `<span class="referrer-icon">&#127881;</span> Invited by <strong>${username.toUpperCase()}</strong>`;
  registerForm.insertBefore(banner, registerForm.firstChild.nextSibling);
}

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
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  authError.classList.add('hidden');
}

function showRegister() {
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  authError.classList.add('hidden');
}

function showForgotPassword() {
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  document.getElementById('forgot-form').classList.remove('hidden');
  document.getElementById('reset-form').classList.add('hidden');
  authError.classList.add('hidden');
}

function showResetForm() {
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
  document.getElementById('reset-form').classList.remove('hidden');
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
  const email = document.getElementById('reg-email').value.trim();
  const displayName = document.getElementById('reg-displayname').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!inviteCode || !email || !displayName || !password) {
    showError('Please fill in all fields');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode, email, displayName, password })
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

async function requestReset() {
  const email = document.getElementById('forgot-email').value.trim();

  if (!email) {
    showError('Please enter your email');
    return;
  }

  try {
    const res = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (res.ok) {
      // Show the code to user (in production, this would be emailed)
      if (data.code) {
        alert('Your reset code is: ' + data.code + '\n\nIn production, this would be emailed to you.');
      }
      showResetForm();
    } else {
      showError(data.error);
    }
  } catch (err) {
    showError('Request failed');
  }
}

async function resetPassword() {
  const code = document.getElementById('reset-code').value.trim();
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (!code || !newPassword || !confirmPassword) {
    showError('Please fill in all fields');
    return;
  }

  if (newPassword !== confirmPassword) {
    showError('Passwords do not match');
    return;
  }

  if (newPassword.length < 4) {
    showError('Password must be at least 4 characters');
    return;
  }

  try {
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, newPassword })
    });

    const data = await res.json();

    if (res.ok) {
      alert('Password reset successful! Please login with your new password.');
      showLogin();
    } else {
      showError(data.error);
    }
  } catch (err) {
    showError('Reset failed');
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

  // Show admin badge and reset button if admin
  const adminBadge = document.getElementById('admin-badge');
  const resetBtn = document.getElementById('reset-btn');
  if (currentUser.is_admin) {
    adminBadge.classList.remove('hidden');
    resetBtn.classList.remove('hidden');
  } else {
    adminBadge.classList.add('hidden');
    resetBtn.classList.add('hidden');
  }

  updateHeaderPhoto();
  loadStats();

  // Check if user needs to complete profile
  if (currentUser.needs_profile) {
    setTimeout(showProfileSetup, 500);
  }
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
          <div class="leaderboard-name" onclick="viewProfile('${player.username}')">${player.username.toUpperCase()}${adminTag}${isYou ? ' (YOU)' : ''}</div>
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
        showVerificationStatus('failed', 'REJECTED: ' + (data.verificationMessage || 'Not a valid beer photo!'));
        setTimeout(hideVerificationStatus, 6000);
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

// Profile Functions
let pendingProfilePhoto = null;

function handleProfilePhotoSelect(input, mode) {
  const file = input.files[0];
  if (file) {
    // Resize image before storing
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 200; // Resize to 200x200
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Center crop
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        pendingProfilePhoto = canvas.toDataURL('image/jpeg', 0.8);

        const preview = document.getElementById(mode + '-photo-preview');
        preview.innerHTML = `<img src="${pendingProfilePhoto}" alt="Profile">`;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

function showProfileSetup() {
  pendingProfilePhoto = null;
  document.getElementById('setup-beer-fact').value = '';
  document.getElementById('setup-photo-preview').innerHTML = '<span>+</span>';
  document.getElementById('profile-setup-modal').classList.remove('hidden');
}

async function saveProfileSetup() {
  const beerFact = document.getElementById('setup-beer-fact').value.trim();

  if (!beerFact) {
    alert('Please enter a beer fact!');
    return;
  }

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beerFact, profilePhoto: pendingProfilePhoto })
    });

    if (res.ok) {
      currentUser.beer_fact = beerFact;
      currentUser.profile_photo = pendingProfilePhoto;
      currentUser.needs_profile = false;
      updateHeaderPhoto();
      document.getElementById('profile-setup-modal').classList.add('hidden');
    } else {
      alert('Failed to save profile');
    }
  } catch (err) {
    alert('Failed to save profile');
  }
}

function showEditProfile() {
  pendingProfilePhoto = currentUser.profile_photo || null;
  document.getElementById('edit-beer-fact').value = currentUser.beer_fact || '';

  const preview = document.getElementById('edit-photo-preview');
  if (currentUser.profile_photo) {
    preview.innerHTML = `<img src="${currentUser.profile_photo}" alt="Profile">`;
  } else {
    preview.innerHTML = '<span>+</span>';
  }

  document.getElementById('edit-profile-modal').classList.remove('hidden');
}

function closeEditProfileModal() {
  document.getElementById('edit-profile-modal').classList.add('hidden');
}

async function saveProfileEdit() {
  const beerFact = document.getElementById('edit-beer-fact').value.trim();

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beerFact: beerFact || null, profilePhoto: pendingProfilePhoto })
    });

    if (res.ok) {
      currentUser.beer_fact = beerFact;
      if (pendingProfilePhoto) currentUser.profile_photo = pendingProfilePhoto;
      updateHeaderPhoto();
      closeEditProfileModal();
    } else {
      alert('Failed to save profile');
    }
  } catch (err) {
    alert('Failed to save profile');
  }
}

async function viewProfile(username) {
  try {
    const res = await fetch('/api/profile/' + encodeURIComponent(username));
    const data = await res.json();

    if (res.ok) {
      const profile = data.profile;

      // Update modal content
      document.getElementById('profile-username').textContent = profile.username.toUpperCase();
      document.getElementById('profile-beers').textContent = profile.beer_count.toLocaleString();
      document.getElementById('profile-fact').textContent = profile.beer_fact || 'No beer fact yet!';

      const photoDisplay = document.getElementById('profile-photo-display');
      if (profile.profile_photo) {
        photoDisplay.innerHTML = `<img src="${profile.profile_photo}" alt="${profile.username}">`;
      } else {
        photoDisplay.innerHTML = '<span>&#127866;</span>';
      }

      const adminTag = document.getElementById('profile-admin-tag');
      if (profile.is_admin) {
        adminTag.classList.remove('hidden');
      } else {
        adminTag.classList.add('hidden');
      }

      // Format member since date
      const memberSince = new Date(profile.member_since);
      document.getElementById('profile-since').textContent = memberSince.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      document.getElementById('view-profile-modal').classList.remove('hidden');
    }
  } catch (err) {
    console.error('Failed to load profile', err);
  }
}

function closeProfileModal() {
  document.getElementById('view-profile-modal').classList.add('hidden');
}

function updateHeaderPhoto() {
  const headerPhoto = document.getElementById('header-profile-photo');
  if (currentUser.profile_photo) {
    headerPhoto.innerHTML = `<img src="${currentUser.profile_photo}" alt="Profile">`;
  } else {
    headerPhoto.innerHTML = '<span>&#127866;</span>';
  }
}

// Admin Reset Functions
function showResetConfirm() {
  document.getElementById('reset-modal').classList.remove('hidden');
}

function closeResetModal() {
  document.getElementById('reset-modal').classList.add('hidden');
}

async function confirmReset() {
  try {
    const res = await fetch('/api/admin/reset', { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      closeResetModal();
      currentUser.beer_count = 0;
      document.getElementById('your-beers').textContent = '0';
      loadStats();
      alert('All progress has been reset!');
    } else {
      alert(data.error || 'Reset failed');
    }
  } catch (err) {
    console.error('Reset error:', err);
    alert('Reset failed');
  }
}
