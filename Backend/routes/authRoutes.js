const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Page routes
router.get('/login', authController.getLogin);
router.get('/signup', authController.getSignUp);

// Authentication Action routes
router.post('/login', authController.postLogin);
router.post('/signup', authController.postSignUp);
router.post('/register', authController.postSignUp);
router.post('/logout', authController.postLogout);
router.get('/logout', authController.postLogout);

// Session status
router.get('/me', authController.getMe);
router.get('/status', authController.getMe);

module.exports = router;
