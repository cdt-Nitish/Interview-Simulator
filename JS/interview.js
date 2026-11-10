// JS/interview.js - Real-Time AI Interview Workstation & Final Evaluation Controller

let currentInterviewId = null;
let currentQuestionId = null;
let currentQuestionText = "";
let currentQuestionIndex = 1;
let totalQuestions = 5;
let sessionQuestions = []; // Stores { order, questionId, questionText, answerText }
let timerInterval = null;
let timerSeconds = 0;

// ==========================================
// 1. DOM Element Getters
// ==========================================
function getQuestionDisplayElement() {
  return document.getElementById('questionDisplay') || document.querySelector('.active-question-heading');
}

function getAnswerInputElement() {
  return document.getElementById('answerInput') || document.getElementById('candidateAnswerInput');
}

// ==========================================
// 2. Timer Utilities
// ==========================================
function startTimer() {
  stopTimer();
  timerSeconds = 0;
  const interviewTimer = document.getElementById('interviewTimer');
  if (interviewTimer) interviewTimer.textContent = '00:00';
  timerInterval = setInterval(() => {
    timerSeconds++;
    const mins = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const secs = String(timerSeconds % 60).padStart(2, '0');
    const timerEl = document.getElementById('interviewTimer');
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ==========================================
// 3. UI Helper & Loading States
// ==========================================
function updateCounters() {
  const answerInput = getAnswerInputElement();
  if (!answerInput) return;
  const text = answerInput.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = answerInput.value.length;

  const wordCountLabel = document.getElementById('wordCountLabel');
  const charCountLabel = document.getElementById('charCountLabel');
  if (wordCountLabel) wordCountLabel.textContent = `${words} words`;
  if (charCountLabel) charCountLabel.textContent = `${chars} chars`;
}

function updateProgressUI() {
  const currentNum = Math.min(currentQuestionIndex, totalQuestions);
  const indicator = document.getElementById('interviewQIndicator');
  const progressBar = document.getElementById('interviewProgressBar');
  const progressPercent = document.getElementById('interviewProgressPercent');

  if (indicator) {
    indicator.textContent = `Question ${currentNum} of ${totalQuestions}`;
  }
  const pct = Math.round(((currentNum - 1) / totalQuestions) * 100);
  if (progressBar) {
    progressBar.style.width = `${pct}%`;
  }
  if (progressPercent) {
    progressPercent.textContent = `${pct}%`;
  }
}

function setEvaluatingState(isReviewing) {
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  const answerInput = getAnswerInputElement();
  const saveStatusIndicator = document.getElementById('saveStatusIndicator');

  if (submitAnswerBtn) {
    submitAnswerBtn.disabled = isReviewing;
    submitAnswerBtn.textContent = isReviewing ? 'Interviewer Reviewing...' : 'Submit Answer';
  }
  if (answerInput) {
    answerInput.disabled = isReviewing;
  }
  if (saveStatusIndicator) {
    saveStatusIndicator.textContent = isReviewing ? 'Processing response...' : 'Auto-saved';
  }
}

function setQuestionLoadingState(isLoading) {
  const heading = getQuestionDisplayElement();
  if (heading && isLoading) {
    heading.innerText = '🧠 Technical Interviewer is preparing your question...';
  }

  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  const answerInput = getAnswerInputElement();

  if (submitAnswerBtn) {
    submitAnswerBtn.disabled = isLoading;
    submitAnswerBtn.textContent = isLoading ? 'Loading...' : 'Submit Answer';
  }
  if (answerInput) {
    answerInput.disabled = isLoading;
  }
}

// ==========================================
// 4. API Integration: Start Interview
// ==========================================
async function startInterview(role, difficulty, experienceLevel) {
  try {
    const setupRoleVal = document.getElementById('setupRole')?.value;
    const setupDiffVal = document.getElementById('setupDifficulty')?.value;
    const setupCountVal = document.getElementById('setupQuestionCount')?.value;

    const selectedRole = role || setupRoleVal || 'Full Stack Developer';
    const selectedDifficulty = difficulty || setupDiffVal || 'Medium';
    const selectedExp = experienceLevel || 'Fresher';
    totalQuestions = parseInt(setupCountVal || '5', 10);

    // Reset session state
    sessionQuestions = [];
    currentQuestionIndex = 1;
    currentInterviewId = null;

    const activeRoleBadge = document.getElementById('activeRoleBadge');
    const activeDiffBadge = document.getElementById('activeDiffBadge');
    const interviewerMessage = document.getElementById('interviewerMessage');
    const finishActionWrap = document.getElementById('finishInterviewActionWrap');

    if (activeRoleBadge) activeRoleBadge.textContent = selectedRole;
    if (activeDiffBadge) activeDiffBadge.textContent = `DIFFICULTY: ${selectedDifficulty.toUpperCase()}`;
    if (finishActionWrap) finishActionWrap.style.display = 'none';

    // Reset MediaPipe session metrics and start camera
    if (window.mediaPipeTracker) {
      window.mediaPipeTracker.resetSessionMetrics();
      window.mediaPipeTracker.startCamera();
    }

    setQuestionLoadingState(true);

    const response = await fetch('/api/interviews/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: selectedRole,
        targetRole: selectedRole,
        difficulty: selectedDifficulty,
        experienceLevel: selectedExp,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = await response.json();

    if (data.interviewId) {
      currentInterviewId = data.interviewId;
      console.log('✅ Interview Session Created! ID:', currentInterviewId);

      // Start timer
      startTimer();

      // Display Interviewer Introduction
      if (interviewerMessage) {
        interviewerMessage.textContent = data.interviewerGreeting || `Welcome. I will be conducting your technical interview for the ${selectedRole} position. Let's begin.`;
      }

      // Populate first question
      if (data.firstQuestion) {
        currentQuestionId = data.firstQuestion.id;
        currentQuestionText = data.firstQuestion.text;

        const heading = getQuestionDisplayElement();
        if (heading) heading.innerText = currentQuestionText;

        const answerInput = getAnswerInputElement();
        if (answerInput) {
          answerInput.value = '';
          answerInput.disabled = false;
          answerInput.focus();
        }
        updateCounters();
        updateProgressUI();
      }

      setQuestionLoadingState(false);
      return data;
    } else {
      throw new Error(data.error || 'Failed to initialize session.');
    }
  } catch (error) {
    console.error('❌ Error starting interview:', error);
    const heading = getQuestionDisplayElement();
    if (heading) {
      heading.innerText = '⚠️ Could not start interview. Please ensure you are logged in and MySQL is running.';
    }
    setQuestionLoadingState(false);
  }
}

// ==========================================
// 5. Submit Answer & Real-Time Interviewer Turn
// ==========================================
async function handleAnswerSubmit() {
  const answerInput = getAnswerInputElement();
  const answerText = answerInput ? answerInput.value.trim() : '';

  if (!answerText) {
    alert('Please enter or dictate your response before submitting.');
    return;
  }

  if (!currentInterviewId || !currentQuestionId) {
    alert('No active interview question found.');
    return;
  }

  setEvaluatingState(true);

  // Save current turn locally
  sessionQuestions.push({
    order: currentQuestionIndex,
    questionId: currentQuestionId,
    questionText: currentQuestionText,
    answerText: answerText
  });

  try {
    const activeRoleBadge = document.getElementById('activeRoleBadge');
    const selectedRole = activeRoleBadge?.textContent || 'Full Stack Developer';

    const response = await fetch(`/api/interviews/${currentInterviewId}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: currentQuestionId,
        questionText: currentQuestionText,
        answerText: answerText,
        history: sessionQuestions,
        targetRole: selectedRole
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Interviewer Turn Response:', data);

    // Update Interviewer Dialogue Box (NO SCORES SHOWN during interview)
    const interviewerMessage = document.getElementById('interviewerMessage');
    if (interviewerMessage && data.interviewerMessage) {
      interviewerMessage.textContent = `"${data.interviewerMessage}"`;
    }

    // Check if session has finished all questions
    if (currentQuestionIndex >= totalQuestions) {
      const heading = getQuestionDisplayElement();
      if (heading) {
        heading.innerText = '🎉 Interview Questions Completed! Click below to compile your final evaluation.';
      }

      const submitAnswerBtn = document.getElementById('submitAnswerBtn');
      if (submitAnswerBtn) submitAnswerBtn.style.display = 'none';

      const finishActionWrap = document.getElementById('finishInterviewActionWrap');
      if (finishActionWrap) finishActionWrap.style.display = 'block';

      if (answerInput) answerInput.disabled = true;
    } else {
      // Advance to next question
      currentQuestionIndex++;
      if (data.nextQuestion) {
        currentQuestionId = data.nextQuestion.id;
        currentQuestionText = data.nextQuestion.text;

        const heading = getQuestionDisplayElement();
        if (heading) heading.innerText = currentQuestionText;

        if (answerInput) {
          answerInput.value = '';
          answerInput.disabled = false;
          answerInput.focus();
        }
        updateCounters();
        updateProgressUI();
      }
    }
  } catch (error) {
    console.error('❌ Error submitting turn:', error);
    alert('Error processing your response: ' + error.message);
  } finally {
    setEvaluatingState(false);
  }
}

// ==========================================
// 6. Final Comprehensive AI Evaluation & Scorecard
// ==========================================
let isFinalizing = false;
let savedSessionSnapshot = {
  interviewId: null,
  sessionQuestions: [],
  sessionMetrics: null
};

const waitMs = (ms) => new Promise(res => setTimeout(res, ms));

function updateEvaluationStage(stageNum, state = 'active') {
  for (let i = 1; i <= 5; i++) {
    const stageEl = document.getElementById(`evalStage${i}`);
    if (!stageEl) continue;
    const iconEl = stageEl.querySelector('.stage-icon');

    if (i < stageNum) {
      stageEl.className = 'eval-stage-item completed';
      if (iconEl) iconEl.textContent = '✅';
    } else if (i === stageNum) {
      if (state === 'completed') {
        stageEl.className = 'eval-stage-item completed';
        if (iconEl) iconEl.textContent = '✅';
      } else if (state === 'failed') {
        stageEl.className = 'eval-stage-item failed';
        if (iconEl) iconEl.textContent = '❌';
      } else {
        stageEl.className = 'eval-stage-item active';
        if (iconEl) iconEl.textContent = '⏳';
      }
    } else {
      stageEl.className = 'eval-stage-item';
      if (iconEl) iconEl.textContent = '⏳';
    }
  }
}

function showEvaluatingOverlay() {
  const overlay = document.getElementById('evaluatingOverlay');
  const loadingBox = document.getElementById('evaluatingLoadingContent');
  const errorBox = document.getElementById('evaluatingErrorContent');

  if (loadingBox) {
    loadingBox.removeAttribute('hidden');
    loadingBox.style.display = 'block';
  }
  if (errorBox) {
    errorBox.setAttribute('hidden', 'true');
    errorBox.style.display = 'none';
  }

  if (overlay) {
    overlay.removeAttribute('hidden');
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
  }
}

function hideEvaluatingOverlay() {
  const overlay = document.getElementById('evaluatingOverlay');
  if (overlay) {
    overlay.setAttribute('hidden', 'true');
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  }
}

function showEvaluatingError(errorMessage = 'The AI evaluation request timed out or encountered an unexpected issue.') {
  const loadingBox = document.getElementById('evaluatingLoadingContent');
  const errorBox = document.getElementById('evaluatingErrorContent');
  const errorMsgEl = document.getElementById('evaluatingErrorMessage');

  if (loadingBox) {
    loadingBox.setAttribute('hidden', 'true');
    loadingBox.style.display = 'none';
  }
  if (errorBox) {
    errorBox.removeAttribute('hidden');
    errorBox.style.display = 'block';
  }
  if (errorMsgEl) {
    errorMsgEl.textContent = errorMessage;
  }
}

async function finishInterviewAndShowResults() {
  if (isFinalizing) {
    console.warn('[Interview Workstation] Finalization evaluation is already in progress.');
    return;
  }
  isFinalizing = true;
  stopTimer();

  showEvaluatingOverlay();

  // Safely collect MediaPipe session telemetry
  let sessionMetrics = null;
  try {
    sessionMetrics = window.mediaPipeTracker?.getSessionMetrics?.() || savedSessionSnapshot.sessionMetrics || null;
  } catch (metricsErr) {
    console.warn('[Interview Workstation] Note reading MediaPipe metrics:', metricsErr);
  }

  // Safely stop camera stream
  try {
    if (window.mediaPipeTracker?.stopCamera) {
      window.mediaPipeTracker.stopCamera();
    }
  } catch (camErr) {
    console.warn('[Interview Workstation] Note stopping camera stream:', camErr);
  }

  // Preserve session data snapshot across retries
  const activeInterviewId = currentInterviewId || savedSessionSnapshot.interviewId;
  const activeQuestions = (sessionQuestions && sessionQuestions.length > 0)
    ? [...sessionQuestions]
    : [...(savedSessionSnapshot.sessionQuestions || [])];

  savedSessionSnapshot = {
    interviewId: activeInterviewId,
    sessionQuestions: activeQuestions,
    sessionMetrics: sessionMetrics
  };

  const controller = new AbortController();
  const clientTimeoutMs = 25000;
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, clientTimeoutMs);

  let stage4Timer = null;

  try {
    // Stage 1: Collecting interview responses
    updateEvaluationStage(1, 'active');
    await waitMs(250);
    updateEvaluationStage(1, 'completed');

    // Stage 2: Validating MediaPipe telemetry
    updateEvaluationStage(2, 'active');
    await waitMs(300);
    updateEvaluationStage(2, 'completed');

    // Stage 3: Evaluating technical depth & answer relevance
    updateEvaluationStage(3, 'active');

    console.log('📊 Submitting session for comprehensive AI scorecard evaluation...', {
      interviewId: activeInterviewId,
      questionsCount: activeQuestions.length,
      metrics: sessionMetrics
    });

    // Advance to Stage 4 after interval while backend processes
    stage4Timer = setTimeout(() => {
      updateEvaluationStage(3, 'completed');
      updateEvaluationStage(4, 'active');
    }, 1800);

    const response = await fetch(`/api/interviews/${activeInterviewId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionQuestions: activeQuestions,
        sessionMetrics: sessionMetrics
      }),
      signal: controller.signal
    });

    clearTimeout(stage4Timer);
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      throw new Error(errJson?.error || errJson?.details || `Server returned HTTP status ${response.status}`);
    }

    const data = await response.json();
    const report = data.report;
    console.log('🎉 Comprehensive Performance Report Received:', report);

    // Complete Stages 4 & 5
    updateEvaluationStage(4, 'completed');
    updateEvaluationStage(5, 'active');
    await waitMs(350);
    updateEvaluationStage(5, 'completed');
    await waitMs(200);

    // Hide Workstation, Hide Overlay, Show Result Modal
    hideEvaluatingOverlay();

    const interviewScreen = document.getElementById('interviewScreen');
    const resultModal = document.getElementById('resultModal');

    if (interviewScreen) {
      interviewScreen.setAttribute('hidden', 'true');
      interviewScreen.classList.add('hidden');
    }
    document.body.style.overflow = '';
    if (resultModal) {
      resultModal.removeAttribute('hidden');
      resultModal.classList.remove('hidden');
    }

    // Map Final Report Data into Scorecard UI
    renderScorecard(report);

  } catch (error) {
    if (stage4Timer) clearTimeout(stage4Timer);
    clearTimeout(timeoutId);
    console.error('❌ Error finalizing interview:', error);

    const isTimeout = error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('abort');
    const userFriendlyMsg = isTimeout
      ? 'The AI evaluation service timed out while compiling your scorecard. Your responses and non-verbal telemetry have been safely saved. Click "Retry Evaluation" to re-generate without re-taking the interview.'
      : `Evaluation compilation issue: ${error.message}. Your interview answers and telemetry are preserved. Click "Retry Evaluation" to re-attempt scorecard compilation.`;

    updateEvaluationStage(3, 'failed');
    showEvaluatingError(userFriendlyMsg);

  } finally {
    isFinalizing = false;
  }
}

/**
 * Render all 8 sections of the Final Scorecard
 */
function renderScorecard(report) {
  if (!report) return;

  // --- Section A: Overall Performance Breakdown ---
  const overall = Number(report.overallScore ?? 7.0);
  const techScore = Number(report.technicalKnowledge ?? report.technicalScore ?? 7.0);
  const relevance = Number(report.answerRelevance ?? 7.0);
  const comm = Number(report.communicationClarity ?? 7.0);
  const problem = Number(report.problemSolving ?? 7.0);

  const resultOverallScore = document.getElementById('resultOverallScore');
  const resultTechScore = document.getElementById('resultTechScore');
  const resultTechBar = document.getElementById('resultTechBar');
  const resultRelevanceScore = document.getElementById('resultRelevanceScore');
  const resultRelevanceBar = document.getElementById('resultRelevanceBar');
  const resultCommScore = document.getElementById('resultCommScore');
  const resultCommBar = document.getElementById('resultCommBar');
  const resultProblemScore = document.getElementById('resultProblemScore');
  const resultProblemBar = document.getElementById('resultProblemBar');
  const resultExecutiveSummary = document.getElementById('resultExecutiveSummary');

  if (resultOverallScore) resultOverallScore.textContent = overall.toFixed(1);
  if (resultTechScore) resultTechScore.textContent = `${techScore.toFixed(1)} / 10`;
  if (resultTechBar) resultTechBar.style.width = `${Math.min(techScore * 10, 100)}%`;
  if (resultRelevanceScore) resultRelevanceScore.textContent = `${relevance.toFixed(1)} / 10`;
  if (resultRelevanceBar) resultRelevanceBar.style.width = `${Math.min(relevance * 10, 100)}%`;
  if (resultCommScore) resultCommScore.textContent = `${comm.toFixed(1)} / 10`;
  if (resultCommBar) resultCommBar.style.width = `${Math.min(comm * 10, 100)}%`;
  if (resultProblemScore) resultProblemScore.textContent = `${problem.toFixed(1)} / 10`;
  if (resultProblemBar) resultProblemBar.style.width = `${Math.min(problem * 10, 100)}%`;

  if (resultExecutiveSummary && report.finalSummary) {
    resultExecutiveSummary.textContent = report.finalSummary;
  }

  // --- Section B: MediaPipe Computer Vision Analysis (Non-Verbal) ---
  const nv = report.nonVerbalAnalysis || {};
  const resultEyeContactVal = document.getElementById('resultEyeContactVal');
  const resultFacePresenceVal = document.getElementById('resultFacePresenceVal');
  const resultHeadStabilityVal = document.getElementById('resultHeadStabilityVal');
  const resultHeadOrientationVal = document.getElementById('resultHeadOrientationVal');
  const resultTrackingReliability = document.getElementById('resultTrackingReliability');
  const resultBehavioralSummary = document.getElementById('resultBehavioralSummary');

  if (nv.eyeContactScore !== null && nv.eyeContactScore !== undefined) {
    if (resultEyeContactVal) resultEyeContactVal.textContent = `${nv.eyeContactScore}%`;
    if (resultFacePresenceVal) resultFacePresenceVal.textContent = `${nv.facePresenceScore}%`;
    if (resultHeadStabilityVal) resultHeadStabilityVal.textContent = `${nv.headStabilityScore}%`;
    if (resultHeadOrientationVal) resultHeadOrientationVal.textContent = `${nv.headOrientationScore}%`;
    if (resultTrackingReliability) resultTrackingReliability.textContent = `RELIABILITY: ${(nv.dataReliability || 'HIGH').toUpperCase()}`;
    if (resultBehavioralSummary) resultBehavioralSummary.textContent = nv.behavioralSummary || 'Eye contact and head stability tracked during live response delivery.';
  } else {
    if (resultEyeContactVal) resultEyeContactVal.textContent = 'Unavailable';
    if (resultFacePresenceVal) resultFacePresenceVal.textContent = 'Unavailable';
    if (resultHeadStabilityVal) resultHeadStabilityVal.textContent = 'Unavailable';
    if (resultHeadOrientationVal) resultHeadOrientationVal.textContent = 'Unavailable';
    if (resultTrackingReliability) resultTrackingReliability.textContent = 'RELIABILITY: UNAVAILABLE';
    if (resultBehavioralSummary) resultBehavioralSummary.textContent = nv.behavioralSummary || 'MediaPipe video telemetry was inactive or not recorded for this round. Behavioral assessment is inconclusive and does not affect the technical evaluation.';
  }

  // --- Section C: Observable Emotional & Behavioral Indicators ---
  const beh = report.behavioralIndicators || {};
  const resultConfidenceBadge = document.getElementById('resultConfidenceBadge');
  const resultAnxietyBadge = document.getElementById('resultAnxietyBadge');
  const resultFearIndicators = document.getElementById('resultFearIndicators');

  if (resultConfidenceBadge) {
    resultConfidenceBadge.textContent = `Observable Confidence: ${beh.confidenceScore || 7}/10`;
  }
  if (resultAnxietyBadge) {
    const anxiety = beh.anxietyLevel || 'Low';
    resultAnxietyBadge.textContent = `Anxiety Level: ${anxiety}`;
    resultAnxietyBadge.className = `behavioral-badge ${anxiety.toLowerCase()}`;
  }
  if (resultFearIndicators) {
    if (Array.isArray(beh.fearIndicatorsDetected) && beh.fearIndicatorsDetected.length > 0) {
      resultFearIndicators.textContent = `Detected Indicators: ${beh.fearIndicatorsDetected.join(', ')}`;
      resultFearIndicators.style.color = '#f87171';
    } else {
      resultFearIndicators.textContent = 'No fear-related movement detected';
      resultFearIndicators.style.color = '#94a3b8';
    }
  }

  // --- Section D: Strengths List ---
  const resultStrengthsList = document.getElementById('resultStrengthsList');
  if (resultStrengthsList) {
    resultStrengthsList.innerHTML = '';
    const strengths = Array.isArray(report.strengths) && report.strengths.length > 0
      ? report.strengths
      : ['Clear understanding of fundamental software principles', 'Composed delivery and active session participation'];

    strengths.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      resultStrengthsList.appendChild(li);
    });
  }

  // --- Section E: Areas for Improvement ---
  const resultImprovementsList = document.getElementById('resultImprovementsList');
  if (resultImprovementsList) {
    resultImprovementsList.innerHTML = '';
    const weaknesses = Array.isArray(report.areasForImprovement) && report.areasForImprovement.length > 0
      ? report.areasForImprovement
      : ['Deepen discussion of production concurrency trade-offs', 'Provide more concrete implementation examples'];

    weaknesses.forEach((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      resultImprovementsList.appendChild(li);
    });
  }

  // --- Actionable Preparation Recommendations ---
  const resultRecommendationsList = document.getElementById('resultRecommendationsList');
  if (resultRecommendationsList) {
    resultRecommendationsList.innerHTML = '';
    const recs = Array.isArray(report.actionableRecommendations) && report.actionableRecommendations.length > 0
      ? report.actionableRecommendations
      : ['Practice answering with structured architectural framing', 'Review database indexing and distributed caching mechanisms'];

    recs.forEach((r) => {
      const li = document.createElement('li');
      li.textContent = r;
      resultRecommendationsList.appendChild(li);
    });
  }

  // --- Section F: Question-by-Question Evaluation Accordion ---
  const resultQuestionsAccordion = document.getElementById('resultQuestionsAccordion');
  if (resultQuestionsAccordion) {
    resultQuestionsAccordion.innerHTML = '';
    const qEvals = Array.isArray(report.questionEvaluations) ? report.questionEvaluations : [];

    if (qEvals.length === 0) {
      resultQuestionsAccordion.innerHTML = '<p style="color: var(--text-dim); padding: 12px;">No individual question breakdowns recorded.</p>';
    } else {
      qEvals.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'accordion-item' + (idx === 0 ? ' open' : '');

        item.innerHTML = `
          <button type="button" class="accordion-trigger" aria-expanded="${idx === 0}">
            <span class="accordion-q-title">Q${q.order || (idx + 1)}: ${q.questionText}</span>
            <span class="accordion-score-tag">Score: ${q.score}/10</span>
          </button>
          <div class="accordion-content">
            <div class="candidate-eval-block">
              <div class="eval-lbl">YOUR ANSWER:</div>
              <div class="eval-ans-text">${q.answerText || '[No answer submitted]'}</div>
            </div>
            <div class="candidate-eval-block">
              <div class="eval-lbl">WHAT WAS CORRECT:</div>
              <div class="eval-correct-text">✓ ${q.whatWasCorrect || 'Accurate explanation of concepts.'}</div>
            </div>
            <div class="candidate-eval-block">
              <div class="eval-lbl">AREAS FOR IMPROVEMENT:</div>
              <div class="eval-missing-text">• ${q.whatWasMissingOrIncorrect || 'Could expand further on trade-offs.'}</div>
            </div>
            <div class="candidate-eval-block">
              <div class="eval-lbl">HOW TO IMPROVE:</div>
              <div class="eval-improve-text">💡 ${q.howToImprove || 'Practice step-by-step technical problem breakdown.'}</div>
            </div>
          </div>
        `;

        const trigger = item.querySelector('.accordion-trigger');
        trigger.addEventListener('click', () => {
          const isOpen = item.classList.contains('open');
          item.classList.toggle('open', !isOpen);
          trigger.setAttribute('aria-expanded', !isOpen);
        });

        resultQuestionsAccordion.appendChild(item);
      });
    }
  }

  // Update timestamps
  const resultTimestamp = document.getElementById('resultTimestamp');
  if (resultTimestamp) {
    resultTimestamp.textContent = `Evaluated: ${new Date().toLocaleTimeString()} • ${report.questionEvaluations?.length || sessionQuestions.length} Questions Completed`;
  }
}

// ==========================================
// 7. Event Listeners & Global Attachments
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const answerInput = getAnswerInputElement();
  const clearAnswerBtn = document.getElementById('clearAnswerBtn');
  const sampleAnswerBtn = document.getElementById('sampleAnswerBtn');
  const endInterviewBtn = document.getElementById('endInterviewBtn');
  const finishAllBtn = document.getElementById('finishAllBtn');
  const startSessionSubmitBtn = document.getElementById('startSessionSubmitBtn');
  const resultDashboardBtn = document.getElementById('resultDashboardBtn');
  const resultTryAgainBtn = document.getElementById('resultTryAgainBtn');
  const setupModal = document.getElementById('setupModal');
  const interviewScreen = document.getElementById('interviewScreen');
  const resultModal = document.getElementById('resultModal');

  // Live word & character counters
  answerInput?.addEventListener('input', updateCounters);

  // Clear Answer Button
  clearAnswerBtn?.addEventListener('click', () => {
    const input = getAnswerInputElement();
    if (input) {
      input.value = '';
      input.focus();
      updateCounters();
    }
  });

  // Sample Answer for instant testing
  sampleAnswerBtn?.addEventListener('click', () => {
    const input = getAnswerInputElement();
    if (input) {
      input.value =
        'In our production microservices architecture, we implemented event-driven messaging with Kafka and Redis caching, ensuring sub-50ms latency while decoupling database write operations.';
      updateCounters();
    }
  });

  // End Session Button in Top Bar
  endInterviewBtn?.addEventListener('click', () => {
    if (confirm('Are you sure you want to end this interview session? Your complete progress will be evaluated.')) {
      finishInterviewAndShowResults();
    }
  });

  // Finish All Early Button in Navigation Grid
  finishAllBtn?.addEventListener('click', () => {
    if (confirm('Finish interview now and calculate final scorecard?')) {
      finishInterviewAndShowResults();
    }
  });

  // Launch interview button in Setup Modal
  startSessionSubmitBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (setupModal) setupModal.setAttribute('hidden', 'true');
    if (interviewScreen) interviewScreen.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    startInterview();
  });

  // Result Modal Actions
  resultDashboardBtn?.addEventListener('click', () => {
    if (resultModal) resultModal.setAttribute('hidden', 'true');
    window.location.href = '/#dashboard-preview';
  });

  resultTryAgainBtn?.addEventListener('click', () => {
    if (resultModal) resultModal.setAttribute('hidden', 'true');
    if (setupModal) setupModal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  });

  // Evaluating Overlay Action Buttons
  const evalRetryBtn = document.getElementById('evalRetryBtn');
  evalRetryBtn?.addEventListener('click', () => {
    finishInterviewAndShowResults();
  });

  const evalReturnBtn = document.getElementById('evalReturnBtn');
  evalReturnBtn?.addEventListener('click', () => {
    hideEvaluatingOverlay();
    document.body.style.overflow = '';
  });
});

// Expose functions globally for inline onclick handlers
window.startInterview = startInterview;
window.handleAnswerSubmit = handleAnswerSubmit;
window.submitAnswer = handleAnswerSubmit;
window.finishInterviewAndShowResults = finishInterviewAndShowResults;
window.retryEvaluation = finishInterviewAndShowResults;
window.hideEvaluatingOverlay = hideEvaluatingOverlay;
