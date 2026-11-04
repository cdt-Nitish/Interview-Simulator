const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');
const authMiddleware = require('../middleware/authMiddleware'); // Your existing auth guard

// Protect all interview routes with your session middleware
router.use(authMiddleware);

router.post('/start', interviewController.startInterview);
router.post('/:interviewId/questions/generate', interviewController.generateQuestion);
router.post('/questions/:questionId/evaluate', interviewController.evaluateAnswer);

module.exports = router;