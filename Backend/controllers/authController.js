const path = require('path');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Helper to determine if client expects JSON response
function wantsJson(req) {
  return (
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    (req.headers['content-type'] && req.headers['content-type'].includes('application/json'))
  );
}

// ==========================================
// 1. GET LOGIN PAGE
// ==========================================
exports.getLogin = (req, res) => {
  const loginFilePath = path.join(__dirname, '..', '..', 'frontend', 'login.html');
  res.sendFile(loginFilePath);
};

// ==========================================
// 2. POST LOGIN
// ==========================================
exports.postLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const isJson = wantsJson(req);

    const sendFailure = (status, message) => {
      if (isJson) {
        return res.status(status).json({ success: false, message });
      }
      return res.status(status).redirect('/login?error=' + encodeURIComponent(message));
    };

    if (!email || !password) {
      return sendFailure(422, 'Email and password are required.');
    }

    // 1. Find user by normalized email in MySQL
    const user = await User.findByEmail(email);

    if (!user) {
      return sendFailure(401, 'Invalid email or password.');
    }

    // 2. Verify hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendFailure(401, 'Invalid email or password.');
    }

    // 3. Set session data for InterviewAI
    req.session.isLoggedIn = true;
    req.session.user = {
      id: user.id,
      _id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.fullName,
      email: user.email,
      role: user.role,
      targetRole: user.targetRole,
      experienceLevel: user.experienceLevel,
    };

    // 4. Save session to MySQL store before responding
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (isJson) {
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        user: req.session.user,
      });
    }

    return res.redirect('/');
  } catch (err) {
    console.error('[AuthController.postLogin Error]', err);
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
    return next(err);
  }
};

// ==========================================
// 3. POST LOGOUT
// ==========================================
exports.postLogout = (req, res, next) => {
  const isJson = wantsJson(req);
  req.session.destroy((err) => {
    if (err) {
      console.error('[AuthController.postLogout Error]', err);
      if (isJson) {
        return res.status(500).json({ success: false, message: 'Could not log out.' });
      }
      return next(err);
    }
    res.clearCookie('connect.sid');
    if (isJson) {
      return res.status(200).json({ success: true, message: 'Logged out successfully.' });
    }
    return res.redirect('/login');
  });
};

// ==========================================
// 4. GET SIGNUP PAGE
// ==========================================
exports.getSignUp = (req, res) => {
  const loginFilePath = path.join(__dirname, '..', '..', 'frontend', 'login.html');
  res.sendFile(loginFilePath);
};

// ==========================================
// 5. POST SIGNUP (Validation + Controller)
// ==========================================
exports.postSignUp = [
  check('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail()
    .custom(async (value) => {
      const existingUser = await User.findByEmail(value);
      if (existingUser) {
        throw new Error('An account with this email already exists.');
      }
      return true;
    }),

  check('password')
    .trim()
    .isLength({ min: 6 })
    .withMessage('Password should be at least 6 characters long'),

  async (req, res, next) => {
    const isJson = wantsJson(req);
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorList = errors.array().map((err) => err.msg);
      if (isJson) {
        return res.status(422).json({
          success: false,
          errors: errorList,
          message: errorList[0] || 'Validation failed.',
        });
      }
      return res.status(422).redirect('/login#register?error=' + encodeURIComponent(errorList[0]));
    }

    try {
      let {
        firstName,
        lastName,
        name,
        email,
        password,
        role,
        targetRole,
        experienceLevel,
      } = req.body;

      // Normalize name inputs
      if (!firstName && name) {
        const parts = name.trim().split(/\s+/);
        firstName = parts[0] || 'Candidate';
        lastName = parts.slice(1).join(' ') || '';
      } else {
        firstName = (firstName || 'Candidate').trim();
        lastName = (lastName || '').trim();
      }

      // 1. Hash password with bcrypt
      const hashedPassword = await bcrypt.hash(password, 12);

      // 2. Persist user into MySQL
      const newUser = await User.create({
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role: role === 'interviewer' || role === 'admin' ? role : 'candidate',
        targetRole: targetRole || role || 'Full Stack',
        experienceLevel: experienceLevel || 'Fresher / Entry',
      });

      // 3. Auto-login session for candidate
      req.session.isLoggedIn = true;
      req.session.user = {
        id: newUser.id,
        _id: newUser.id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        name: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        targetRole: newUser.targetRole,
        experienceLevel: newUser.experienceLevel,
      };

      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      if (isJson) {
        return res.status(201).json({
          success: true,
          message: 'Account created successfully in MySQL database.',
          user: req.session.user,
        });
      }

      return res.redirect('/');
    } catch (err) {
      console.error('[AuthController.postSignUp Error]', err);
      if (isJson) {
        return res.status(422).json({
          success: false,
          message: err.message || 'Registration failed.',
        });
      }
      return res.status(422).redirect('/login#register?error=' + encodeURIComponent(err.message));
    }
  },
];

// ==========================================
// 6. GET CURRENT USER / STATUS (/api/auth/me)
// ==========================================
exports.getMe = (req, res) => {
  if (req.session && req.session.isLoggedIn && req.session.user) {
    return res.status(200).json({
      success: true,
      isLoggedIn: true,
      user: req.session.user,
    });
  }

  return res.status(200).json({
    success: true,
    isLoggedIn: false,
    user: null,
  });
};
