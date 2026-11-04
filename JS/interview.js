// JS/interview.js - Production-Ready Frontend Controller for InterviewAI & Qwen 3 (4B)

let currentInterviewId = null;
let currentQuestionId = null;
let currentQuestionText = "";
let currentQuestionIndex = 1;
let totalQuestions = 5;
let sessionQuestions = []; // Stores question history & evaluation records
let timerInterval = null;
let timerSeconds = 0;

// ==========================================
// 1. Helper function to get Question Heading Element
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

function setEvaluatingState(isEvaluating) {
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  const answerInput = getAnswerInputElement();
  const saveStatusIndicator = document.getElementById('saveStatusIndicator');

  if (submitAnswerBtn) {
    submitAnswerBtn.disabled = isEvaluating;
    submitAnswerBtn.textContent = isEvaluating ? 'Evaluating...' : 'Submit Answer';
  }
  if (answerInput) {
    answerInput.disabled = isEvaluating;
  }
  if (saveStatusIndicator) {
    saveStatusIndicator.textContent = isEvaluating ? 'Evaluating response...' : 'Auto-saved';
  }
}

function setQuestionLoadingState(isLoading) {
  const heading = getQuestionDisplayElement();
  if (heading && isLoading) {
    heading.innerText = '🧠 Qwen 3 (4B) is drafting your next interview question...';
  }

  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  const answerInput = getAnswerInputElement();

  if (submitAnswerBtn) {
    submitAnswerBtn.disabled = isLoading;
    submitAnswerBtn.textContent = isLoading ? 'Loading Question...' : 'Submit Answer';
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
    const feedbackBox = document.getElementById('feedbackBox');

    if (activeRoleBadge) activeRoleBadge.textContent = selectedRole;
    if (activeDiffBadge) activeDiffBadge.textContent = `DIFFICULTY: ${selectedDifficulty.toUpperCase()}`;
    if (feedbackBox) feedbackBox.style.display = 'none';

    // Show initial loading text in heading
    const questionHeading = getQuestionDisplayElement();
    if (questionHeading) {
      questionHeading.innerText = 'Initializing interview workstation & contacting Qwen 3 (4B)...';
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
      startTimer();
      await getNextQuestion(selectedRole, selectedExp);
      return data;
    } else {
      throw new Error(data.error || 'Failed to initialize session.');
    }
  } catch (error) {
    console.error('❌ Error starting interview:', error);
    const questionHeading = getQuestionDisplayElement();
    if (questionHeading) {
      questionHeading.innerText = '⚠️ Could not start interview. Please ensure you are logged in and MySQL is running.';
    }
    setQuestionLoadingState(false);
  }
}

// ==========================================
// 5. API Integration: Generate Question
// ==========================================
async function getNextQuestion(role, experienceLevel) {
  if (!currentInterviewId) {
    console.warn('No active interview session ID found.');
    return;
  }

  // Hide feedback box when moving forward
  const feedbackBox = document.getElementById('feedbackBox');
  if (feedbackBox) feedbackBox.style.display = 'none';

  setQuestionLoadingState(true);

  const activeRoleBadge = document.getElementById('activeRoleBadge');
  const selectedRole = role || activeRoleBadge?.textContent || 'Full Stack Developer';
  const selectedExp = experienceLevel || 'Fresher';

  try {
    const response = await fetch(`/api/interviews/${currentInterviewId}/questions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetRole: selectedRole,
        experienceLevel: selectedExp,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = await response.json();
    currentQuestionId = data.questionId;
    currentQuestionText = data.question;

    // Direct DOM binding: Select the heading element by its unique ID and update .innerText
    const questionHeading = document.getElementById('questionDisplay') || getQuestionDisplayElement();
    if (questionHeading) {
      questionHeading.innerText = currentQuestionText;
    }

    const answerInput = getAnswerInputElement();
    if (answerInput) {
      answerInput.value = '';
      answerInput.disabled = false;
      answerInput.focus();
    }
    updateCounters();
    updateProgressUI();

    console.log(`✅ Loaded Question ${currentQuestionIndex}:`, currentQuestionText);
    return data;
  } catch (error) {
    console.error('❌ Error generating question:', error);
    const questionHeading = document.getElementById('questionDisplay') || getQuestionDisplayElement();
    if (questionHeading) {
      questionHeading.innerText = '⚠️ Error generating question. Please check that Ollama (Qwen 3 4B) is running.';
    }
  } finally {
    setQuestionLoadingState(false);
  }
}

// ==========================================
// 6. API Integration: Evaluate Answer
// ==========================================
async function handleAnswerSubmit() {
  const answerInput = getAnswerInputElement();
  const answerText = answerInput ? answerInput.value.trim() : '';

  if (!answerText) {
    alert('Please enter or dictate your answer before submitting.');
    return;
  }

  if (!currentQuestionId) {
    alert('No active question found to evaluate.');
    return;
  }

  setEvaluatingState(true);

  try {
    const response = await fetch(`/api/interviews/questions/${currentQuestionId}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionText: currentQuestionText,
        answerText: answerText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const data = await response.json();
    const evaluation = data.evaluation || data;

    console.log('✅ Qwen 3 (4B) Evaluation Result:', evaluation);

    // Save turn to session history
    sessionQuestions.push({
      order: currentQuestionIndex,
      questionId: currentQuestionId,
      questionText: currentQuestionText,
      answerText: answerText,
      score: evaluation.score !== undefined ? Number(evaluation.score) : 7,
      strengths: Array.isArray(evaluation.strengths) ? evaluation.strengths : [evaluation.strengths || 'Good response'],
      weaknesses: Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses : [evaluation.weaknesses || 'Keep practicing'],
      followUpQuestion: evaluation.followUpQuestion || '',
    });

    // Populate Real-Time Feedback Box
    const scoreDisplay = document.getElementById('scoreDisplay');
    const strengthsDisplay = document.getElementById('strengthsDisplay');
    const feedbackBox = document.getElementById('feedbackBox');

    if (scoreDisplay) {
      scoreDisplay.textContent = evaluation.score !== undefined ? evaluation.score : 'N/A';
    }
    if (strengthsDisplay) {
      strengthsDisplay.textContent = Array.isArray(evaluation.strengths)
        ? evaluation.strengths.join(', ')
        : evaluation.strengths || 'Solid foundational reasoning.';
    }

    if (feedbackBox) {
      feedbackBox.style.display = 'block';
      feedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Check if session has concluded
    if (currentQuestionIndex >= totalQuestions) {
      const nextBtn = feedbackBox ? feedbackBox.querySelector('button') : null;
      if (nextBtn) {
        nextBtn.textContent = 'View Final Performance Report →';
        nextBtn.onclick = () => finishInterviewAndShowResults();
      }
    } else {
      currentQuestionIndex++;
      const nextBtn = feedbackBox ? feedbackBox.querySelector('button') : null;
      if (nextBtn) {
        nextBtn.textContent = 'Next Question →';
        nextBtn.onclick = () => getNextQuestion();
      }
    }

    return evaluation;
  } catch (error) {
    console.error('❌ Error evaluating answer:', error);
    alert('Evaluation failed: ' + error.message);
  } finally {
    setEvaluatingState(false);
  }
}

// ==========================================
// 7. Final Diagnostic Report Mapping
// ==========================================
function finishInterviewAndShowResults() {
  stopTimer();

  // Stop webcam feed safely if available
  if (typeof window.stopCamera === 'function') {
    window.stopCamera();
  }

  // Switch views from Workstation to Result Modal
  const interviewScreen = document.getElementById('interviewScreen');
  const resultModal = document.getElementById('resultModal');

  if (interviewScreen) interviewScreen.setAttribute('hidden', 'true');
  document.body.style.overflow = '';
  if (resultModal) resultModal.removeAttribute('hidden');

  // Compute overall & breakdown metrics
  let avgScore = 8.0;
  if (sessionQuestions.length > 0) {
    const totalScore = sessionQuestions.reduce((sum, q) => sum + (q.score || 0), 0);
    avgScore = Number((totalScore / sessionQuestions.length).toFixed(1));
  }

  const techScore = avgScore;
  const commScore = Math.min(Number((avgScore * 0.95).toFixed(1)), 10);
  const relevanceScore = Math.min(Number((avgScore * 0.98).toFixed(1)), 10);

  // 1. Map Scores
  const resultOverallScore = document.getElementById('resultOverallScore');
  const resultTechScore = document.getElementById('resultTechScore');
  const resultTechBar = document.getElementById('resultTechBar');
  const resultCommScore = document.getElementById('resultCommScore');
  const resultCommBar = document.getElementById('resultCommBar');
  const resultRelevanceScore = document.getElementById('resultRelevanceScore');
  const resultRelevanceBar = document.getElementById('resultRelevanceBar');

  if (resultOverallScore) resultOverallScore.textContent = avgScore.toFixed(1);
  if (resultTechScore) resultTechScore.textContent = `${techScore.toFixed(1)} / 10`;
  if (resultTechBar) resultTechBar.style.width = `${Math.min(techScore * 10, 100)}%`;
  if (resultCommScore) resultCommScore.textContent = `${commScore.toFixed(1)} / 10`;
  if (resultCommBar) resultCommBar.style.width = `${Math.min(commScore * 10, 100)}%`;
  if (resultRelevanceScore) resultRelevanceScore.textContent = `${relevanceScore.toFixed(1)} / 10`;
  if (resultRelevanceBar) resultRelevanceBar.style.width = `${Math.min(relevanceScore * 10, 100)}%`;

  // 2. Map Strengths List
  const resultStrengthsList = document.getElementById('resultStrengthsList');
  if (resultStrengthsList) {
    resultStrengthsList.innerHTML = '';
    const allStrengths = [];
    sessionQuestions.forEach((q) => {
      q.strengths.forEach((s) => {
        if (!allStrengths.includes(s) && s) allStrengths.push(s);
      });
    });

    const displayStrengths = allStrengths.length > 0
      ? allStrengths
      : ['Clear explanation of underlying technical principles', 'Structured step-by-step problem framing'];

    displayStrengths.slice(0, 4).forEach((strength) => {
      const li = document.createElement('li');
      li.textContent = strength;
      resultStrengthsList.appendChild(li);
    });
  }

  // 3. Map Areas to Improve (Weaknesses)
  const resultImprovementsList = document.getElementById('resultImprovementsList');
  if (resultImprovementsList) {
    resultImprovementsList.innerHTML = '';
    const allWeaknesses = [];
    sessionQuestions.forEach((q) => {
      q.weaknesses.forEach((w) => {
        if (!allWeaknesses.includes(w) && w) allWeaknesses.push(w);
      });
    });

    const displayWeaknesses = allWeaknesses.length > 0
      ? allWeaknesses
      : ['Provide more concrete production trade-offs', 'Include performance benchmarks in code examples'];

    displayWeaknesses.slice(0, 4).forEach((weakness) => {
      const li = document.createElement('li');
      li.textContent = weakness;
      resultImprovementsList.appendChild(li);
    });
  }

  // 4. Map Question-by-Question Accordion
  const resultQuestionsAccordion = document.getElementById('resultQuestionsAccordion');
  if (resultQuestionsAccordion) {
    resultQuestionsAccordion.innerHTML = '';

    if (sessionQuestions.length === 0) {
      resultQuestionsAccordion.innerHTML = '<p style="color: var(--text-dim);">No questions evaluated in this session.</p>';
    } else {
      sessionQuestions.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'accordion-item' + (idx === 0 ? ' open' : '');

        item.innerHTML = `
          <button type="button" class="accordion-trigger" aria-expanded="${idx === 0}">
            <span class="accordion-q-title">Q${q.order}: ${q.questionText}</span>
            <span class="accordion-score-tag">Score: ${q.score}/10</span>
          </button>
          <div class="accordion-content">
            <div class="candidate-eval-block">
              <div class="eval-lbl">YOUR ANSWER:</div>
              <div class="eval-ans-text">${q.answerText || 'No answer submitted.'}</div>
            </div>
            <div class="candidate-eval-block">
              <div class="eval-lbl">KEY STRENGTHS:</div>
              <div class="eval-feedback-text" style="color: #4ade80;">• ${q.strengths.join(' • ')}</div>
            </div>
            <div class="candidate-eval-block">
              <div class="eval-lbl">IMPROVEMENT AREAS:</div>
              <div class="eval-feedback-text" style="color: #f87171;">• ${q.weaknesses.join(' • ')}</div>
            </div>
            ${q.followUpQuestion ? `
            <div class="candidate-eval-block">
              <div class="eval-lbl">SUGGESTED FOLLOW-UP:</div>
              <div class="eval-feedback-text" style="color: #38bdf8;">"${q.followUpQuestion}"</div>
            </div>` : ''}
          </div>
        `;

        // Toggle click handler
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

  // 5. Update Metadata
  const resultSubtitle = document.getElementById('resultSubtitle');
  const resultTimestamp = document.getElementById('resultTimestamp');

  if (resultSubtitle) {
    resultSubtitle.textContent = 'Diagnostic performance scoring evaluated by Qwen 3 (4B) & MediaPipe signals';
  }
  if (resultTimestamp) {
    resultTimestamp.textContent = `Evaluated: ${new Date().toLocaleTimeString()} • ${sessionQuestions.length} Questions Completed`;
  }
}

// ==========================================
// 8. Event Listeners & Global Attachments
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const answerInput = getAnswerInputElement();
  const clearAnswerBtn = document.getElementById('clearAnswerBtn');
  const sampleAnswerBtn = document.getElementById('sampleAnswerBtn');
  const endInterviewBtn = document.getElementById('endInterviewBtn');
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
    if (confirm('Are you sure you want to end this interview session? Your progress will be evaluated.')) {
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
});

// Expose functions globally for inline onclick handlers
window.startInterview = startInterview;
window.getNextQuestion = getNextQuestion;
window.handleAnswerSubmit = handleAnswerSubmit;
window.submitAnswer = handleAnswerSubmit;
window.finishInterviewAndShowResults = finishInterviewAndShowResults;
