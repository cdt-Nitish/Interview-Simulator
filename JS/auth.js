// JS/auth.js - Central Authentication Handler for Both Modals & Standalone Login Page

document.addEventListener('DOMContentLoaded', () => {
  // Modal elements (index.html)
  const loginModal = document.getElementById('loginModal');
  const registerModal = document.getElementById('registerModal');
  const loginNavBtn = document.getElementById('loginNavBtn');
  const logoutNavBtn = document.getElementById('logoutNavBtn');
  const authLoggedOutActions = document.getElementById('authLoggedOutActions');
  const authLoggedInActions = document.getElementById('authLoggedInActions');
  const navUserName = document.getElementById('navUserName');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const switchToRegisterBtn = document.getElementById('switchToRegisterBtn');
  const switchToLoginBtn = document.getElementById('switchToLoginBtn');

  // Shared form elements
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  // Standalone page elements (frontend/login.html)
  const showLoginBtn = document.getElementById('showLogin');
  const showRegisterBtn = document.getElementById('showRegister');
  const authForms = document.getElementById('authForms');
  const logoutPanel = document.getElementById('logoutPanel');
  const logoutBtn = document.getElementById('logoutBtn');
  const authMessage = document.getElementById('authMessage');
  const loggedInAs = document.getElementById('loggedInAs');

  const isStandalonePage = !!authForms;

  function showMessage(text) {
    if (authMessage) {
      authMessage.textContent = text;
      authMessage.hidden = false;
    }
  }

  // Standalone tab switcher
  function setStandaloneMode(mode) {
    const registering = mode === 'register';
    if (loginForm) loginForm.hidden = registering;
    if (registerForm) registerForm.hidden = !registering;

    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    if (authTitle) authTitle.textContent = registering ? 'Create your account' : 'Welcome back';
    if (authSubtitle) {
      authSubtitle.textContent = registering
        ? 'Set up your InterviewAI profile.'
        : 'Log in to access your interview practice.';
    }

    if (showLoginBtn) showLoginBtn.className = registering ? 'btn btn-secondary' : 'btn btn-primary';
    if (showRegisterBtn) showRegisterBtn.className = registering ? 'btn btn-primary' : 'btn btn-secondary';
    if (authMessage) authMessage.hidden = true;

    if (location.hash === '#register' && !registering) {
      history.replaceState(null, '', 'login.html');
    }
  }

  showLoginBtn?.addEventListener('click', () => setStandaloneMode('login'));
  showRegisterBtn?.addEventListener('click', () => setStandaloneMode('register'));

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

      if (authForms && logoutPanel) {
        authForms.hidden = true;
        logoutPanel.hidden = false;
        if (loggedInAs) loggedInAs.textContent = displayName;
      }
    } else {
      if (authLoggedOutActions) authLoggedOutActions.hidden = false;
      if (authLoggedInActions) authLoggedInActions.hidden = true;

      if (authForms && logoutPanel) {
        authForms.hidden = false;
        logoutPanel.hidden = true;
      }
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
    const email = document.getElementById('loginEmail')?.value.trim().toLowerCase();
    const password = document.getElementById('loginPassword')?.value;
    const errorEl = document.getElementById('loginEmailError');
    if (errorEl) errorEl.textContent = '';
    if (authMessage) authMessage.hidden = true;

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
        if (loginModal) closeModal(loginModal);
        if (isStandalonePage) window.location.href = '/';
      } else {
        const errMsg = data.message || 'Invalid email or password.';
        if (errorEl) errorEl.textContent = errMsg;
        showMessage(errMsg);
      }
    } catch (err) {
      const fallbackMsg = 'Server connection error. Please try again.';
      if (errorEl) errorEl.textContent = fallbackMsg;
      showMessage(fallbackMsg);
    }
  });

  // Register Form Submission
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('regName')?.value || '').trim();
    const email = (document.getElementById('regEmail')?.value || '').trim().toLowerCase();
    const role = document.getElementById('regRole')?.value || 'Full Stack Developer';
    const password = document.getElementById('regPassword')?.value;
    const confirmPassword = document.getElementById('regConfirmPassword')?.value;
    const errorEl = document.getElementById('regEmailError');
    const passErrorEl = document.getElementById('regConfirmPasswordError');

    if (errorEl) errorEl.textContent = '';
    if (passErrorEl) passErrorEl.textContent = '';
    if (authMessage) authMessage.hidden = true;

    if (confirmPassword !== undefined && password !== confirmPassword) {
      if (passErrorEl) passErrorEl.textContent = 'Passwords do not match.';
      return;
    }

    if (!password || password.length < 6) {
      const msg = 'Password must contain at least 6 characters.';
      if (passErrorEl) passErrorEl.textContent = msg;
      showMessage(msg);
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
        if (registerModal) closeModal(registerModal);
        if (isStandalonePage) window.location.href = '/';
      } else {
        const errMsg = data.message || (data.errors && data.errors[0]) || 'Registration failed.';
        if (errorEl) errorEl.textContent = errMsg;
        showMessage(errMsg);
      }
    } catch (err) {
      const fallbackMsg = 'Server connection error. Please try again.';
      if (errorEl) errorEl.textContent = fallbackMsg;
      showMessage(fallbackMsg);
    }
  });

  // Logout Handlers (Navbar & Standalone page)
  const handleLogout = async (e) => {
    if (e) e.preventDefault();
    try {
      await fetch('/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('interviewAIUser');
    updateAuthState(null);
    if (isStandalonePage) {
      setStandaloneMode('login');
      showMessage('You have been logged out.');
    }
  };

  logoutNavBtn?.addEventListener('click', handleLogout);
  logoutBtn?.addEventListener('click', handleLogout);

  if (isStandalonePage && location.hash === '#register') {
    setStandaloneMode('register');
  }

  checkSession();
});
