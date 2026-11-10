const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');
const authMiddleware = require('../middleware/authMiddleware'); // Your existing auth guard

// Protect all interview routes with your session middleware
router.use(authMiddleware);

router.post('/start', interviewController.startInterview);
router.post('/:interviewId/questions/generate', interviewController.generateQuestion);
router.post('/:interviewId/turn', interviewController.processTurn);
router.post('/:interviewId/finalize', interviewController.finalizeInterview);
router.post('/questions/:questionId/evaluate', interviewController.evaluateAnswer);
router.post('/behavior/analyze', interviewController.analyzeBehavior);
router.post('/:interviewId/behavior/analyze', interviewController.analyzeBehavior);

module.exports = router;