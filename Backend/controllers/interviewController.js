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

  const { targetRole, role, difficulty, interviewType, experienceLevel } = req.body || {};
  const selectedRole = role || targetRole || 'Full Stack Developer';
  const selectedDifficulty = difficulty || 'Medium';
  const selectedType = interviewType || 'Technical';
  const selectedExp = experienceLevel || 'Fresher';

  try {
    const [result] = await pool.query(
      `INSERT INTO interviews (user_id, role, interview_type, difficulty, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, selectedRole, selectedType, selectedDifficulty, 'in_progress']
    );

    const interviewId = result.insertId;

    // Generate first question
    const firstQuestion = await qwenService.generateQuestion(selectedRole, selectedExp, []);

    // Save Question 1 to DB
    const [qResult] = await pool.query(
      'INSERT INTO questions (interview_id, question_text, question_order) VALUES (?, ?, 1)',
      [interviewId, firstQuestion]
    );

    const initialGreeting = `Hello. Welcome to your technical interview for the ${selectedRole} position. I will be evaluating your conceptual understanding, practical reasoning, and problem-solving abilities. Let's begin with our first question.`;

    return res.status(201).json({
      success: true,
      interviewId,
      role: selectedRole,
      difficulty: selectedDifficulty,
      experienceLevel: selectedExp,
      firstQuestion: {
        id: qResult.insertId,
        text: firstQuestion,
        order: 1
      },
      interviewerGreeting: initialGreeting,
      message: 'Interview started successfully'
    });
  } catch (error) {
    console.error('[interviewController.startInterview Error]', error);
    return res.status(500).json({ success: false, error: 'Failed to start interview', details: error.message });
  }
};

/**
 * 2. Generate and save a question using AI service
 * POST /api/interviews/:interviewId/questions/generate
 */
exports.generateQuestion = async (req, res) => {
  const { interviewId } = req.params;
  const { targetRole, role, experienceLevel, previousQuestions = [] } = req.body || {};
  const roleName = targetRole || role || 'Full Stack Developer';
  const exp = experienceLevel || 'Fresher';

  if (!interviewId) {
    return res.status(400).json({ success: false, error: 'Interview ID is required.' });
  }

  try {
    const [interviewRows] = await pool.query(
      'SELECT id, role FROM interviews WHERE id = ?',
      [interviewId]
    );

    if (!interviewRows || interviewRows.length === 0) {
      return res.status(404).json({ success: false, error: `Interview session with ID ${interviewId} not found.` });
    }

    const sessionRole = roleName || interviewRows[0].role || 'Full Stack Developer';

    // Fetch existing questions for exclusion
    const [existingQRows] = await pool.query(
      'SELECT question_text FROM questions WHERE interview_id = ? ORDER BY question_order ASC',
      [interviewId]
    );
    const prevQTexts = existingQRows.map(r => r.question_text).concat(previousQuestions);

    const questionText = await qwenService.generateQuestion(sessionRole, exp, prevQTexts);
    const questionOrder = existingQRows.length + 1;

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
 * 3. Process Live Interviewer Turn (No marks shown during interview)
 * POST /api/interviews/:interviewId/turn
 */
exports.processTurn = async (req, res) => {
  const { interviewId } = req.params;
  const { questionId, questionText, answerText, history = [], targetRole, experienceLevel } = req.body || {};
  const userId = req.user?.id || req.session?.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  try {
    // 1. Verify interview exists
    const [interviewRows] = await pool.query(
      'SELECT id, role, difficulty FROM interviews WHERE id = ?',
      [interviewId]
    );

    if (!interviewRows || interviewRows.length === 0) {
      return res.status(404).json({ success: false, error: `Interview ${interviewId} not found.` });
    }

    const role = targetRole || interviewRows[0].role || 'Full Stack Developer';
    const exp = experienceLevel || 'Fresher';

    // 2. Save candidate answer turn to MySQL
    if (questionId) {
      await pool.query(
        `INSERT INTO answers (question_id, user_id, answer_text) 
         VALUES (?, ?, ?)`,
        [questionId, userId, answerText || '']
      );
    }

    // 3. Process interviewer reaction and follow-up/next question
    const turnResult = await qwenService.processInterviewerTurn({
      role,
      experienceLevel: exp,
      currentQuestion: questionText,
      candidateAnswer: answerText,
      history
    });

    // 4. Save next question to DB
    let nextQuestionId = null;
    if (turnResult.nextQuestion) {
      const [countRows] = await pool.query(
        'SELECT COUNT(*) as total FROM questions WHERE interview_id = ?',
        [interviewId]
      );
      const nextOrder = (countRows[0]?.total || 0) + 1;

      const [qResult] = await pool.query(
        'INSERT INTO questions (interview_id, question_text, question_order) VALUES (?, ?, ?)',
        [interviewId, turnResult.nextQuestion, nextOrder]
      );
      nextQuestionId = qResult.insertId;
      turnResult.nextQuestionOrder = nextOrder;
    }

    return res.status(200).json({
      success: true,
      interviewerMessage: turnResult.interviewerMessage,
      nextQuestion: {
        id: nextQuestionId,
        text: turnResult.nextQuestion,
        order: turnResult.nextQuestionOrder,
        isFollowUp: turnResult.isFollowUp
      }
    });
  } catch (error) {
    console.error('[interviewController.processTurn Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process interview turn',
      details: error.message
    });
  }
};

/**
 * 4. Final Comprehensive Interview Evaluation
 * POST /api/interviews/:interviewId/finalize
 */
exports.finalizeInterview = async (req, res) => {
  const { interviewId } = req.params;
  const { sessionQuestions = [], sessionMetrics = null } = req.body || {};
  const userId = req.user?.id || req.session?.user?.id;

  if (!interviewId || isNaN(Number(interviewId))) {
    return res.status(400).json({ success: false, error: 'Invalid or missing interview ID parameter.' });
  }

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  try {
    const [interviewRows] = await pool.query(
      'SELECT id, role, interview_type, difficulty, status, score, feedback FROM interviews WHERE id = ?',
      [interviewId]
    );

    if (!interviewRows || interviewRows.length === 0) {
      return res.status(404).json({ success: false, error: `Interview ${interviewId} not found.` });
    }

    const interviewRecord = interviewRows[0];

    // Prevent duplicate evaluation runs if already completed and feedback is stored
    if (interviewRecord.status === 'completed' && interviewRecord.feedback) {
      try {
        const cachedReport = typeof interviewRecord.feedback === 'string'
          ? JSON.parse(interviewRecord.feedback)
          : interviewRecord.feedback;
        if (cachedReport && (cachedReport.overallScore !== undefined || cachedReport.technicalKnowledge !== undefined)) {
          console.log(`[interviewController.finalize] Returning cached evaluation scorecard for interview #${interviewId}`);
          return res.status(200).json({
            success: true,
            interviewId: Number(interviewId),
            report: cachedReport,
            isCached: true
          });
        }
      } catch (cacheErr) {
        console.warn('[interviewController.finalize] Cached feedback JSON parse notice:', cacheErr.message);
      }
    }

    // Format Q&A dataset
    let questionsForEval = sessionQuestions;
    if (!questionsForEval || questionsForEval.length === 0) {
      // Pull recorded questions and answers from DB
      const [dbRows] = await pool.query(
        `SELECT q.id as questionId, q.question_text as questionText, q.question_order as \`order\`, a.answer_text as answerText
         FROM questions q
         LEFT JOIN answers a ON q.id = a.question_id AND a.user_id = ?
         WHERE q.interview_id = ?
         ORDER BY q.question_order ASC`,
        [userId, interviewId]
      );
      questionsForEval = dbRows || [];
    }

    // Call comprehensive multi-modal AI evaluation engine
    const evaluation = await qwenService.evaluateFullInterview({
      role: interviewRecord.role,
      difficulty: interviewRecord.difficulty,
      questions: questionsForEval,
      metrics: sessionMetrics
    });

    // 1. Update overall score and feedback in interviews table safely
    try {
      await pool.query(
        `UPDATE interviews 
         SET score = ?, status = 'completed', feedback = ?
         WHERE id = ?`,
        [
          evaluation.overallScore,
          JSON.stringify(evaluation),
          interviewId
        ]
      );
    } catch (dbErr) {
      console.warn('[interviewController.finalize] DB interview update notice:', dbErr.message);
    }

    // 2. Update individual answer scores safely
    if (Array.isArray(evaluation.questionEvaluations)) {
      for (const qEval of evaluation.questionEvaluations) {
        if (qEval.order) {
          try {
            await pool.query(
              `UPDATE answers a
               JOIN questions q ON a.question_id = q.id
               SET a.score = ?, a.feedback = ?
               WHERE q.interview_id = ? AND q.question_order = ?`,
              [
                qEval.score,
                JSON.stringify({
                  whatWasCorrect: qEval.whatWasCorrect,
                  whatWasMissingOrIncorrect: qEval.whatWasMissingOrIncorrect,
                  howToImprove: qEval.howToImprove
                }),
                interviewId,
                qEval.order
              ]
            );
          } catch (updateErr) {
            console.warn('[interviewController.finalize] Answer score update note:', updateErr.message);
          }
        }
      }
    }

    // 3. Persist MediaPipe session metrics into interview_metrics table safely
    if (sessionMetrics) {
      try {
        const facePct = sessionMetrics.facePresence !== null && sessionMetrics.facePresence !== undefined ? Number(sessionMetrics.facePresence) : 0;
        const eyePct = sessionMetrics.eyeContact !== null && sessionMetrics.eyeContact !== undefined ? Number(sessionMetrics.eyeContact) : 0;
        await pool.query(
          `INSERT INTO interview_metrics (interview_id, face_detection_pct, eye_contact_pct)
           VALUES (?, ?, ?)`,
          [interviewId, facePct, eyePct]
        );
      } catch (metricErr) {
        console.warn('[interviewController.finalize] Metrics persistence notice:', metricErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      interviewId: Number(interviewId),
      report: evaluation
    });
  } catch (error) {
    console.error('[interviewController.finalizeInterview Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to finalize interview evaluation',
      details: error.message
    });
  }
};

/**
 * 5. Evaluate candidate answer directly (Backward compatibility)
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

/**
 * 6. Analyze candidate behavioral metrics (Verbal + MediaPipe Non-Verbal)
 * POST /api/interviews/behavior/analyze
 * POST /api/interviews/:interviewId/behavior/analyze
 */
exports.analyzeBehavior = async (req, res) => {
  const interviewId = req.params.interviewId || req.body.interviewId || null;
  const verbalResponse = req.body.verbalResponse || req.body.answerText || req.body.transcript || '';
  const nonVerbalMetrics = req.body.nonVerbalMetrics || req.body.metrics || null;

  try {
    const analysis = await qwenService.analyzeBehavior(verbalResponse, nonVerbalMetrics);

    if (interviewId && nonVerbalMetrics) {
      try {
        const facePct = parseFloat(nonVerbalMetrics.face_detection_pct ?? nonVerbalMetrics.facePresence ?? 0);
        const eyePct = parseFloat(nonVerbalMetrics.eye_contact_pct ?? nonVerbalMetrics.eyeContact ?? 0);

        await pool.query(
          `INSERT INTO interview_metrics (interview_id, face_detection_pct, eye_contact_pct)
           VALUES (?, ?, ?)`,
          [interviewId, facePct, eyePct]
        );
      } catch (metricErr) {
        console.warn('[interviewController.analyzeBehavior] Metrics DB persistence notice:', metricErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      interviewId: interviewId ? Number(interviewId) : null,
      analysis
    });
  } catch (error) {
    console.error('[interviewController.analyzeBehavior Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze interview behavior',
      details: error.message
    });
  }
};
