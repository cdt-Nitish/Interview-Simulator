const { pool } = require('../config/db');
const qwenService = require('../services/qwenService');

/**
 * 1. Start a new interview session
 * POST /api/interviews/start
 */
exports.startInterview = async (req, res) => {
  const userId = req.user?.id || req.session?.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  const { targetRole, role, difficulty, interviewType } = req.body || {};
  const selectedRole = role || targetRole || 'Full Stack Developer';
  const selectedDifficulty = difficulty || 'Medium';
  const selectedType = interviewType || 'Technical';

  try {
    const [result] = await pool.query(
      `INSERT INTO interviews (user_id, role, interview_type, difficulty, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, selectedRole, selectedType, selectedDifficulty, 'in_progress']
    );

    return res.status(201).json({
      success: true,
      interviewId: result.insertId,
      role: selectedRole,
      difficulty: selectedDifficulty,
      message: 'Interview started successfully'
    });
  } catch (error) {
    console.error('[interviewController.startInterview Error]', error);
    return res.status(500).json({ success: false, error: 'Failed to start interview', details: error.message });
  }
};

/**
 * 2. Generate and save a question using Qwen via Ollama
 * POST /api/interviews/:interviewId/questions/generate
 */
exports.generateQuestion = async (req, res) => {
  const { interviewId } = req.params;
  const { targetRole, role, experienceLevel } = req.body || {};
  const roleName = targetRole || role || 'Full Stack Developer';
  const exp = experienceLevel || 'Fresher';

  if (!interviewId) {
    return res.status(400).json({ success: false, error: 'Interview ID is required.' });
  }

  try {
    // 1. Verify interview exists in DB to prevent foreign key errors
    const [interviewRows] = await pool.query(
      'SELECT id, role FROM interviews WHERE id = ?',
      [interviewId]
    );

    if (!interviewRows || interviewRows.length === 0) {
      return res.status(404).json({ success: false, error: `Interview session with ID ${interviewId} not found.` });
    }

    const sessionRole = roleName || interviewRows[0].role || 'Full Stack Developer';

    // 2. Generate question text
    const questionText = await qwenService.generateQuestion(sessionRole, exp);

    // 3. Determine next question sequence number
    const [countRows] = await pool.query(
      'SELECT COUNT(*) as total FROM questions WHERE interview_id = ?',
      [interviewId]
    );
    const questionOrder = (countRows[0]?.total || 0) + 1;

    // 4. Save to MySQL questions table
    const [result] = await pool.query(
      'INSERT INTO questions (interview_id, question_text, question_order) VALUES (?, ?, ?)',
      [interviewId, questionText, questionOrder]
    );

    return res.status(201).json({
      success: true,
      questionId: result.insertId,
      question: questionText,
      order: questionOrder
    });
  } catch (error) {
    console.error('[interviewController.generateQuestion Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate question',
      details: error.message
    });
  }
};

/**
 * 3. Evaluate candidate answer and persist scoring in MySQL
 * POST /api/interviews/questions/:questionId/evaluate
 */
exports.evaluateAnswer = async (req, res) => {
  const { questionId } = req.params;
  const { answerText, questionText } = req.body || {};
  const userId = req.user?.id || req.session?.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  if (!answerText) {
    return res.status(422).json({ success: false, message: 'answerText is required for evaluation.' });
  }

  try {
    const evaluation = await qwenService.evaluateAnswer(questionText || 'Interview Question', answerText);

    // Format strengths, weaknesses & followUpQuestion inside the feedback column
    const feedbackPayload = JSON.stringify({
      strengths: evaluation.strengths || [],
      weaknesses: evaluation.weaknesses || [],
      followUpQuestion: evaluation.followUpQuestion || ''
    });

    const [result] = await pool.query(
      `INSERT INTO answers (question_id, user_id, answer_text, score, feedback) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        questionId,
        userId,
        answerText,
        evaluation.score !== undefined ? evaluation.score : null,
        feedbackPayload
      ]
    );

    return res.status(200).json({
      success: true,
      answerId: result.insertId,
      evaluation
    });
  } catch (error) {
    console.error('[interviewController.evaluateAnswer Error]', error);
    return res.status(500).json({ success: false, error: 'Failed to evaluate answer', details: error.message });
  }
};
