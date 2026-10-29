const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
require('dotenv').config();

const { connectDB, pool, isDbConnected } = require('./Backend/config/db');
const MySQLSessionStore = require('./Backend/config/sessionStore');
const authRoutes = require('./Backend/routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MySQL and auto-initialize relational schema tables
connectDB();

// Body Parser & CORS Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session configuration with MySQL Session Store
let sessionConfig = {
  secret: process.env.SESSION_SECRET || 'interview_simulator_session_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    sameSite: 'lax',
  },
};

try {
  sessionConfig.store = new MySQLSessionStore(pool);
} catch (e) {
  console.warn('[Session] Running with memory session store fallback:', e.message);
}

app.use(session(sessionConfig));

// Expose session variables to views/templates
app.use((req, res, next) => {
  res.locals.isLoggedIn = req.session?.isLoggedIn || false;
  res.locals.user = req.session?.user || null;
  next();
});

// Serve static assets
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/JS', express.static(path.join(__dirname, 'JS')));
app.use('/frontend', express.static(path.join(__dirname, 'frontend')));
app.use(express.static(path.join(__dirname)));

// Auth Routes (supports both root-level /login, /signup, /logout and /api/auth/*)
app.use(authRoutes);
app.use('/api/auth', authRoutes);

// System Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    database: 'MySQL 8.0+',
    databaseConnected: isDbConnected(),
    timestamp: new Date().toISOString(),
    sessionActive: !!req.session?.isLoggedIn,
    service: 'InterviewAI Platform API',
  });
});

// Render / Serve Main Landing & Simulator (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Explicit login page route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

// Fallback route: serve index.html for unknown HTML requests
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  next();
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`🚀 InterviewAI Simulator running successfully with MySQL!`);
    console.log(`🌐 Application URL: http://localhost:${PORT}`);
    console.log(`🗄️ Database: MySQL 8.0+`);
    console.log(`=============================================================\n`);
  });
}

module.exports = app;
