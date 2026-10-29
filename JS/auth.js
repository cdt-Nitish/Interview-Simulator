// Client-side Authentication & Session Synchronization with MySQL Backend
document.addEventListener('DOMContentLoaded', () => {
  const loginModal = document.getElementById('loginModal');
  const registerModal = document.getElementById('registerModal');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginNavBtn = document.getElementById('loginNavBtn');
  const logoutNavBtn = document.getElementById('logoutNavBtn');
  const authLoggedOutActions = document.getElementById('authLoggedOutActions');
  const authLoggedInActions = document.getElementById('authLoggedInActions');
  const navUserName = document.getElementById('navUserName');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const switchToRegisterBtn = document.getElementById('switchToRegisterBtn');
  const switchToLoginBtn = document.getElementById('switchToLoginBtn');

  // Modal helpers
  const openModal = (modal) => {
    if (modal) {
      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeModal = (modal) => {
    if (modal) {
      modal.setAttribute('hidden', 'true');
      document.body.style.overflow = '';
    }
  };

  // Switch between Login and Register modals
  switchToRegisterBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal(loginModal);
    openModal(registerModal);
  });

  switchToLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal(registerModal);
    openModal(loginModal);
  });

  loginNavBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(loginModal);
  });

  // UI Session State Updater
  function updateAuthState(user) {
    if (user) {
      if (authLoggedOutActions) authLoggedOutActions.hidden = true;
      if (authLoggedInActions) authLoggedInActions.hidden = false;
      const displayName = user.name || user.firstName || user.email || 'Candidate';
      if (navUserName) navUserName.textContent = displayName;
      if (navUserAvatar) navUserAvatar.textContent = (displayName[0] || 'U').toUpperCase();
    } else {
      if (authLoggedOutActions) authLoggedOutActions.hidden = false;
      if (authLoggedInActions) authLoggedInActions.hidden = true;
    }
  }

  // Check Active Session
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.isLoggedIn && data.user) {
          localStorage.setItem('interviewAIUser', JSON.stringify(data.user));
          updateAuthState(data.user);
          return;
        }
      }
    } catch (e) {}

    const localUser = localStorage.getItem('interviewAIUser');
    if (localUser) {
      try {
        updateAuthState(JSON.parse(localUser));
      } catch {
        updateAuthState(null);
      }
    } else {
      updateAuthState(null);
    }
  }

  // Login Form Submission
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const errorEl = document.getElementById('loginEmailError');
    if (errorEl) errorEl.textContent = '';

    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('interviewAIUser', JSON.stringify(data.user));
        updateAuthState(data.user);
        closeModal(loginModal);
      } else {
        if (errorEl) errorEl.textContent = data.message || 'Invalid email or password.';
      }
    } catch (err) {
      if (errorEl) errorEl.textContent = 'Server connection error. Please try again.';
    }
  });

  // Register Form Submission
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const role = document.getElementById('regRole')?.value;
    const password = document.getElementById('regPassword')?.value;
    const confirmPassword = document.getElementById('regConfirmPassword')?.value;
    const errorEl = document.getElementById('regEmailError');
    const passErrorEl = document.getElementById('regConfirmPasswordError');

    if (errorEl) errorEl.textContent = '';
    if (passErrorEl) passErrorEl.textContent = '';

    if (password !== confirmPassword) {
      if (passErrorEl) passErrorEl.textContent = 'Passwords do not match.';
      return;
    }

    try {
      const res = await fetch('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('interviewAIUser', JSON.stringify(data.user));
        updateAuthState(data.user);
        closeModal(registerModal);
      } else {
        if (errorEl) errorEl.textContent = data.message || (data.errors && data.errors[0]) || 'Registration failed.';
      }
    } catch (err) {
      if (errorEl) errorEl.textContent = 'Server connection error. Please try again.';
    }
  });

  // Logout Trigger
  logoutNavBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch('/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('interviewAIUser');
    updateAuthState(null);
  });

  checkSession();
});

