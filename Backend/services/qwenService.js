/**
 * Backend/services/qwenService.js
 * Multi-Provider AI Interview Service (Gemini API + Local Ollama/Qwen 3 with Resilient Evaluator)
 */

require('dotenv').config();
const {
  BEHAVIORAL_ANALYSIS_SYSTEM_PROMPT,
  BEHAVIORAL_EVALUATION_SCHEMA,
  buildBehavioralUserPrompt
} = require('../prompts/behavioralPrompt');

const {
  INTERVIEWER_PERSONA_SYSTEM_PROMPT,
  FINAL_EVALUATION_SYSTEM_PROMPT
} = require('../prompts/interviewPrompt');

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_CHAT_URL = process.env.OLLAMA_URL || `${OLLAMA_BASE.replace(/\/+$/, '')}/api/chat`;
const OLLAMA_GEN_URL = `${OLLAMA_BASE.replace(/\/+$/, '')}/api/generate`;
const PRIMARY_MODEL = process.env.QWEN_MODEL || 'qwen3:4b';
const FALLBACK_MODEL = 'qwen3:1.7b';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/**
 * Robust JSON extraction helper that safely handles:
 * - Markdown code fences (```json ... ```)
 * - Trailing/leading whitespace or chatter
 * - Substring matching of outermost {...}
 */
function extractJsonFromText(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();

  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Attempt direct JSON parse first
  try {
    return JSON.parse(text);
  } catch (err) {
    // Attempt regex extraction of outermost JSON object {...}
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // Fallback failed
      }
    }
    return null;
  }
}

// Curated role-specific fallback question pool
const FALLBACK_QUESTIONS = {
  'full stack': [
    "Can you explain the end-to-end lifecycle of a web request from the browser address bar to the database and back?",
    "How do you design and structure RESTful APIs to ensure scalability, rate limiting, and secure authentication?",
    "What are the key trade-offs between client-side rendering (CSR) and server-side rendering (SSR)?",
    "How does the database indexing mechanism work in MySQL (B-Trees), and how do you optimize slow queries?",
    "Explain how asynchronous I/O and the event loop work in Node.js when handling thousands of concurrent requests."
  ],
  'frontend': [
    "Explain the JavaScript event loop, microtasks, and macrotasks with a concrete execution example.",
    "How does the Virtual DOM work in modern frontend frameworks, and how do you optimize rendering performance?",
    "What strategies do you use for efficient state management and caching in large single-page applications?",
    "How do you optimize Largest Contentful Paint (LCP) and Cumulative Layout Shift (CLS) in a production web app?"
  ],
  'backend': [
    "How do you design a database schema to handle high-concurrency read and write operations without deadlocks?",
    "Explain the differences between SQL and NoSQL databases, and when you would choose each in production.",
    "What architectural patterns and techniques do you apply to secure backend microservices against injection and token forgery?",
    "How do database connection pools work in Node.js, and what happens when all connections are exhausted?"
  ],
  'default': [
    "Can you describe a challenging technical project you built, the architectural trade-offs you faced, and how you solved them?",
    "How do you approach debugging a high-latency performance bottleneck in a web application?",
    "Explain how authentication works using JWT tokens and secure HTTP-only session cookies."
  ]
};

function getCuratedQuestion(targetRole = 'Full Stack', excludeQuestions = []) {
  const normalized = (targetRole || 'full stack').toLowerCase();
  let pool = FALLBACK_QUESTIONS.default;
  for (const [key, questions] of Object.entries(FALLBACK_QUESTIONS)) {
    if (normalized.includes(key)) {
      pool = questions;
      break;
    }
  }
  const filtered = pool.filter(q => !excludeQuestions.includes(q));
  const activePool = filtered.length > 0 ? filtered : pool;
  return activePool[Math.floor(Math.random() * activePool.length)];
}

/**
 * Call Google Gemini REST API
 */
async function callGemini(userPrompt, systemPrompt = '', timeoutMs = 15000) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: userPrompt }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini API returned status ${res.status}: ${errBody.slice(0, 120)}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) throw new Error('No candidate content from Gemini');
    const parsed = extractJsonFromText(candidate);
    if (!parsed) throw new Error(`Could not parse JSON from Gemini response: ${candidate.slice(0, 100)}`);
    return parsed;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Call Ollama API with timeout control
 */
async function callOllama(url, payload, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * 1. Generate Question
 */
const generateQuestion = async (targetRole = 'Full Stack Developer', experienceLevel = 'Fresher', previousQuestions = []) => {
  const prompt = `You are a professional technical interviewer. Ask exactly ONE challenging interview question for a ${experienceLevel} ${targetRole}. Return ONLY the question text without any pleasantries or numbering.${previousQuestions.length > 0 ? ` Do not repeat these questions: ${JSON.stringify(previousQuestions)}` : ''}`;

  // Try Gemini if configured
  if (GEMINI_API_KEY) {
    try {
      const geminiRes = await callGemini(prompt, 'You are an interviewer. Return JSON: {"question": "..."}');
      if (geminiRes?.question) return geminiRes.question.trim();
    } catch (err) {
      console.warn('[AI Service] Gemini question generation failed, falling back to Ollama:', err.message);
    }
  }

  // Try Ollama Primary
  try {
    const res = await callOllama(OLLAMA_GEN_URL, {
      model: PRIMARY_MODEL,
      prompt: prompt,
      stream: false
    }, 15000);

    if (res.ok) {
      const data = await res.json();
      const text = (data.response || data.message?.content || '').trim();
      if (text && text.length > 10) {
        return text.replace(/^["'\s]+|["'\s]+$/g, '');
      }
    }
  } catch (err) {
    console.warn(`[AI Service] Ollama primary (${PRIMARY_MODEL}) failed:`, err.message);
  }

  // Try Ollama Fast Fallback
  if (PRIMARY_MODEL !== FALLBACK_MODEL) {
    try {
      const res = await callOllama(OLLAMA_GEN_URL, {
        model: FALLBACK_MODEL,
        prompt: prompt,
        stream: false
      }, 12000);

      if (res.ok) {
        const data = await res.json();
        const text = (data.response || data.message?.content || '').trim();
        if (text && text.length > 10) {
          return text.replace(/^["'\s]+|["'\s]+$/g, '');
        }
      }
    } catch (err) {
      console.warn(`[AI Service] Ollama fallback (${FALLBACK_MODEL}) failed:`, err.message);
    }
  }

  // Curated question fallback
  return getCuratedQuestion(targetRole, previousQuestions);
};

/**
 * 2. Process Interviewer Turn (Conversational Dialogue during interview)
 * Provides realistic, calm, slightly strict interviewer responses without showing marks.
 */
const processInterviewerTurn = async ({
  role = 'Full Stack Developer',
  experienceLevel = 'Fresher',
  currentQuestion = '',
  candidateAnswer = '',
  history = []
}) => {
  const answer = (candidateAnswer || '').trim();
  const words = answer ? answer.split(/\s+/) : [];
  const lower = answer.toLowerCase();

  // Detect empty or greeting responses
  const isGreeting = ['hi', 'hello', 'hlo', 'hey', 'good morning', 'good evening', 'test'].includes(lower);
  const isEmpty = words.length === 0;
  const isMeaningless = isEmpty || isGreeting || (words.length < 3 && !lower.includes('api') && !lower.includes('http') && !lower.includes('data'));

  if (isMeaningless) {
    const nextQ = getCuratedQuestion(role, history.map(h => h.questionText));
    return {
      interviewerMessage: isEmpty
        ? "You did not provide an answer. In a technical interview, articulating your reasoning or stating what you know is always better than passing. Let's move to the next question."
        : "A simple greeting does not address the technical problem. As an interviewer, I need to evaluate your practical knowledge. Let's proceed to our next technical question.",
      nextQuestion: nextQ,
      isFollowUp: false,
      isMeaningless: true
    };
  }

  // Build prompt for conversational interviewer reaction
  const prompt = `Candidate Job Role: ${experienceLevel} ${role}
Current Question: "${currentQuestion}"
Candidate Response: "${candidateAnswer}"

Analyze the candidate's answer. Formulate:
1. "interviewerMessage": A concise (1-2 sentences) professional interviewer remark. Polite, calm, slightly strict. If the answer is basic or incomplete, acknowledge it briefly and note what was missing. If solid, acknowledge concisely. Never give away the answer or use overly enthusiastic praise.
2. "nextQuestion": A targeted technical follow-up if their answer missed key mechanisms, or a new relevant question if they answered well.
3. "isFollowUp": boolean (true if probing the same topic).`;

  // Try Gemini
  if (GEMINI_API_KEY) {
    try {
      const res = await callGemini(prompt, INTERVIEWER_PERSONA_SYSTEM_PROMPT);
      if (res?.interviewerMessage && res?.nextQuestion) {
        return {
          interviewerMessage: res.interviewerMessage,
          nextQuestion: res.nextQuestion,
          isFollowUp: Boolean(res.isFollowUp),
          isMeaningless: false
        };
      }
    } catch (err) {
      console.warn('[AI Service] Gemini turn processing error:', err.message);
    }
  }

  // Try Ollama
  try {
    const res = await callOllama(OLLAMA_CHAT_URL, {
      model: PRIMARY_MODEL,
      messages: [
        { role: 'system', content: INTERVIEWER_PERSONA_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      stream: false,
      format: {
        type: 'object',
        properties: {
          interviewerMessage: { type: 'string' },
          nextQuestion: { type: 'string' },
          isFollowUp: { type: 'boolean' }
        },
        required: ['interviewerMessage', 'nextQuestion', 'isFollowUp']
      }
    }, 15000);

    if (res.ok) {
      const data = await res.json();
      const content = JSON.parse(data.message?.content || data.response || '{}');
      if (content.interviewerMessage && content.nextQuestion) {
        return {
          interviewerMessage: content.interviewerMessage,
          nextQuestion: content.nextQuestion,
          isFollowUp: Boolean(content.isFollowUp),
          isMeaningless: false
        };
      }
    }
  } catch (err) {
    console.warn('[AI Service] Ollama turn error:', err.message);
  }

  // Deterministic realistic interviewer reaction
  if (words.length < 15) {
    return {
      interviewerMessage: "That gives a high-level summary, but it leaves out several underlying mechanics and implementation details.",
      nextQuestion: `Can you elaborate on how you would implement and test that in a production environment under load?`,
      isFollowUp: true,
      isMeaningless: false
    };
  } else {
    const nextQ = getCuratedQuestion(role, history.map(h => h.questionText));
    return {
      interviewerMessage: "Understood. That touches on the main architectural components. Let's move forward.",
      nextQuestion: nextQ,
      isFollowUp: false,
      isMeaningless: false
    };
  }
};

/**
 * 3. Evaluate Single Answer (Strict 0-10, No 5/10 floor)
 */
const evaluateAnswer = async (question, answer) => {
  const cleanAns = (answer || '').trim();
  const words = cleanAns ? cleanAns.split(/\s+/) : [];
  const lower = cleanAns.toLowerCase();

  // Handle empty or greeting/nonsense responses
  if (words.length === 0) {
    return {
      score: 0,
      strengths: [],
      weaknesses: ["No response was provided for this question."],
      followUpQuestion: "What is your understanding of the core concept in this question?"
    };
  }

  if (['hi', 'hello', 'hlo', 'hey'].includes(lower) || (words.length < 4 && !lower.includes('api') && !lower.includes('sql') && !lower.includes('http'))) {
    return {
      score: 1,
      strengths: [],
      weaknesses: [
        "The response was a greeting or non-answer rather than a technical explanation.",
        "Demonstrated no measurable technical knowledge of the topic."
      ],
      followUpQuestion: "Can you provide a technical definition and real-world example?"
    };
  }

  const prompt = `Evaluate this candidate answer strictly from 0 to 10:
Question: "${question}"
Candidate Answer: "${cleanAns}"

Grading scale:
- 0: Empty
- 1: Meaningless / greeting / completely irrelevant
- 2-4: Extremely vague or confused
- 5-6: Partially correct, high-level only
- 7-8: Solid technical answer with minor omissions
- 9-10: Accurate, complete, in-depth

Return JSON:
{
  "score": <number 0-10>,
  "strengths": ["<strength>"],
  "weaknesses": ["<weakness>"],
  "followUpQuestion": "<follow-up>"
}`;

  if (GEMINI_API_KEY) {
    try {
      const res = await callGemini(prompt, 'You are a strict technical evaluator. Return JSON.');
      if (res && res.score !== undefined) return res;
    } catch (e) {}
  }

  try {
    const res = await callOllama(OLLAMA_CHAT_URL, {
      model: PRIMARY_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: {
        type: 'object',
        properties: {
          score: { type: 'number' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          followUpQuestion: { type: 'string' }
        },
        required: ['score', 'strengths', 'weaknesses', 'followUpQuestion']
      }
    }, 20000);

    if (res.ok) {
      const data = await res.json();
      return JSON.parse(data.message?.content || data.response || '{}');
    }
  } catch (e) {}

  // Deterministic realistic evaluation
  return evaluateAnswerRuleBased(question, cleanAns);
};

/**
 * Deterministic rule-based evaluation helper
 */
function evaluateAnswerRuleBased(question, answer) {
  const text = (answer || '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lower = text.toLowerCase();

  if (words === 0) {
    return {
      score: 0,
      strengths: [],
      weaknesses: ["No response was provided."],
      followUpQuestion: "Could you describe the basic concept?"
    };
  }

  if (['hi', 'hello', 'hlo', 'hey'].includes(lower) || words <= 2) {
    return {
      score: 1,
      strengths: [],
      weaknesses: ["The submission was a non-answer without technical content."],
      followUpQuestion: "Please define the primary components involved."
    };
  }

  if (words < 12) {
    return {
      score: 3.5,
      strengths: ["Attempted a brief answer"],
      weaknesses: [
        "Answer is too brief and lacks technical depth",
        "Did not discuss underlying mechanisms or implementation trade-offs"
      ],
      followUpQuestion: "How does this function in a high-concurrency production system?"
    };
  }

  if (words < 30) {
    return {
      score: 6.0,
      strengths: ["Identified core concepts correctly"],
      weaknesses: [
        "Could expand on edge cases and failure handling",
        "Missing concrete architectural examples"
      ],
      followUpQuestion: "What happens when this fails under network latency or heavy database load?"
    };
  }

  return {
    score: 8.5,
    strengths: [
      "Articulated technical concepts accurately with good structure",
      "Demonstrated practical understanding of system architecture"
    ],
    weaknesses: [
      "Could include specific performance benchmarking metrics"
    ],
    followUpQuestion: "How would you monitor and trace this in a distributed microservices environment?"
  };
}

/**
 * 4. Comprehensive Final Interview Evaluation
 * Evaluates entire Q&A transcript + MediaPipe telemetry.
 * Dynamic scoring: Tech Knowledge 40%, Relevance 25%, Comm 20%, Problem Solving 15%.
 * MediaPipe non-verbal metrics evaluated separately.
 */
const evaluateFullInterview = async (sessionData) => {
  const {
    role = 'Full Stack Developer',
    experienceLevel = 'Fresher',
    difficulty = 'Medium',
    questions = [],
    metrics = null
  } = sessionData;

  const userPrompt = `Evaluate this completed mock interview:

Target Position: ${experienceLevel} ${role}
Difficulty Level: ${difficulty}

--- INTERVIEW Q&A TRANSCRIPT ---
${questions.map((q, i) => `Q${i + 1}: "${q.questionText}"\nCandidate Answer: "${q.answerText || '[No Answer]'}"\n`).join('\n')}

--- MEDIAPIPE NON-VERBAL METRICS ---
${metrics ? JSON.stringify(metrics, null, 2) : 'MediaPipe telemetry is unavailable or was not captured.'}

Evaluate the interview thoroughly and return valid JSON conforming strictly to the requested schema.`;

  // 1. Try Gemini
  if (GEMINI_API_KEY) {
    try {
      console.log('[AI Service] Calling Gemini API for comprehensive final evaluation...');
      const geminiRes = await callGemini(userPrompt, FINAL_EVALUATION_SYSTEM_PROMPT, 15000);
      if (geminiRes && (geminiRes.overallScore !== undefined || geminiRes.technicalKnowledge !== undefined)) {
        return sanitizeFullEvaluation(geminiRes, sessionData);
      }
    } catch (err) {
      console.warn('[AI Service] Gemini evaluation failed, attempting Ollama:', err.message);
    }
  }

  // 2. Try Ollama Primary
  try {
    console.log(`[AI Service] Calling Ollama (${PRIMARY_MODEL}) for comprehensive evaluation...`);
    const res = await callOllama(OLLAMA_CHAT_URL, {
      model: PRIMARY_MODEL,
      messages: [
        { role: 'system', content: FINAL_EVALUATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      stream: false,
      format: 'json'
    }, 15000);

    if (res.ok) {
      const data = await res.json();
      const rawContent = data.message?.content || data.response || '{}';
      const content = extractJsonFromText(rawContent);
      if (content && (content.overallScore !== undefined || content.technicalKnowledge !== undefined)) {
        return sanitizeFullEvaluation(content, sessionData);
      }
    }
  } catch (err) {
    console.warn(`[AI Service] Ollama evaluation failed on ${PRIMARY_MODEL}:`, err.message);
  }

  // 3. Robust, objective deterministic final evaluation
  console.log('[AI Service] Executing rule-grounded comprehensive evaluation engine...');
  return fallbackFullInterviewEvaluation(sessionData);
};

/**
 * Sanitize and validate AI evaluation output
 */
function sanitizeFullEvaluation(evalOutput, sessionData) {
  const questions = sessionData.questions || [];
  
  // Ensure question evaluations exist
  if (!Array.isArray(evalOutput.questionEvaluations) || evalOutput.questionEvaluations.length === 0) {
    evalOutput.questionEvaluations = questions.map((q, idx) => {
      const single = evaluateAnswerRuleBased(q.questionText, q.answerText);
      return {
        order: q.order || (idx + 1),
        questionText: q.questionText,
        answerText: q.answerText || '',
        score: single.score,
        whatWasCorrect: single.strengths.join('; ') || 'Attempted response.',
        whatWasMissingOrIncorrect: single.weaknesses.join('; ') || 'Could add more technical depth.',
        howToImprove: single.followUpQuestion || 'Practice answering with structured mechanics.'
      };
    });
  }

  // Enforce correct weighted technical formula
  const techKnowledge = Number(evalOutput.technicalKnowledge ?? 7.0);
  const relevance = Number(evalOutput.answerRelevance ?? 7.0);
  const comm = Number(evalOutput.communicationClarity ?? 7.0);
  const prob = Number(evalOutput.problemSolving ?? 7.0);

  const weightedTech = Number(((techKnowledge * 0.40) + (relevance * 0.25) + (comm * 0.20) + (prob * 0.15)).toFixed(1));
  evalOutput.technicalScore = weightedTech;
  evalOutput.overallScore = weightedTech;

  return evalOutput;
}

/**
 * Objective, rule-grounded comprehensive interview evaluation fallback.
 * Strictly calculates dynamic scores (0-10) with exact weighted formula.
 * Evaluates MediaPipe non-verbal metrics separately.
 */
function fallbackFullInterviewEvaluation(sessionData) {
  const {
    role = 'Full Stack Developer',
    experienceLevel = 'Fresher',
    questions = [],
    metrics = null
  } = sessionData;

  const questionEvaluations = [];
  let totalScore = 0;
  let totalWords = 0;
  let nonAnswersCount = 0;

  questions.forEach((q, idx) => {
    const text = (q.answerText || '').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const lower = text.toLowerCase();
    totalWords += words;

    let score = 0;
    let whatWasCorrect = "";
    let whatWasMissing = "";
    let howToImprove = "";

    if (words === 0) {
      score = 0;
      nonAnswersCount++;
      whatWasCorrect = "None.";
      whatWasMissing = "No answer was submitted for this question.";
      howToImprove = "Formulate a response explaining the primary definition, protocol, or architectural component.";
    } else if (['hi', 'hello', 'hlo', 'hey'].includes(lower) || words <= 2) {
      score = 1.0;
      nonAnswersCount++;
      whatWasCorrect = "None.";
      whatWasMissing = "The response was a greeting or placeholder with zero technical explanation.";
      howToImprove = "Directly address the question with technical terms, step-by-step lifecycle explanation, and practical examples.";
    } else if (words < 12) {
      score = 3.5;
      whatWasCorrect = "Identified high-level terminology related to the topic.";
      whatWasMissing = "Did not explain the actual execution mechanism, trade-offs, or production context.";
      howToImprove = "Elaborate with concrete architectural steps: state management, network flow, and error states.";
    } else if (words < 30) {
      score = 6.5;
      whatWasCorrect = "Explained core concepts accurately and demonstrated working familiarity.";
      whatWasMissing = "Lacked discussion of edge cases, scalability limits, or database concurrency trade-offs.";
      howToImprove = "Incorporate enterprise-level trade-offs (e.g. latency, indexing, decoupling via message queues).";
    } else {
      score = 8.5;
      whatWasCorrect = "Comprehensive and structured technical explanation covering core mechanics.";
      whatWasMissing = "Could include specific performance benchmarks or distributed monitoring considerations.";
      howToImprove = "Discuss automated testing strategies and observability practices (metrics, distributed tracing).";
    }

    totalScore += score;
    questionEvaluations.push({
      order: q.order || (idx + 1),
      questionText: q.questionText,
      answerText: q.answerText || '',
      score: Number(score.toFixed(1)),
      whatWasCorrect,
      whatWasMissingOrIncorrect: whatWasMissing,
      howToImprove
    });
  });

  const questionCount = Math.max(questions.length, 1);
  const avgQScore = totalScore / questionCount;

  // Weighted Rubric
  const techKnowledge = Number(Math.max(0, Math.min(10, avgQScore)).toFixed(1));
  const answerRelevance = Number(Math.max(0, Math.min(10, avgQScore * (nonAnswersCount > 0 ? 0.85 : 1.02))).toFixed(1));
  const commClarity = Number(Math.max(0, Math.min(10, Math.min(avgQScore + 0.5, totalWords / (questionCount * 10) + 2))).toFixed(1));
  const problemSolving = Number(Math.max(0, Math.min(10, avgQScore * 0.95)).toFixed(1));

  // Technical Score = (40% Tech) + (25% Relevance) + (20% Comm) + (15% Problem Solving)
  const weightedTechnicalScore = Number(((techKnowledge * 0.40) + (answerRelevance * 0.25) + (commClarity * 0.20) + (problemSolving * 0.15)).toFixed(1));

  // Separate MediaPipe Non-Verbal Telemetry Evaluation
  const hasValidMetrics = metrics && (metrics.validSamples > 0 || metrics.facePresence > 0);
  let nonVerbalAnalysis = null;
  let behavioralIndicators = null;

  if (hasValidMetrics) {
    const eyeContact = metrics.eyeContact !== null ? Math.round(metrics.eyeContact) : 75;
    const facePresence = metrics.facePresence !== null ? Math.round(metrics.facePresence) : 85;
    const headStability = metrics.headStability !== null ? Math.round(metrics.headStability) : 80;
    const headOrientation = metrics.headOrientation !== null ? Math.round(metrics.headOrientation) : 85;
    const trackingCoverage = metrics.trackingCoverage !== null ? Math.round(metrics.trackingCoverage) : 90;
    const reliability = metrics.dataReliability || (metrics.validSamples > 50 ? 'High' : 'Moderate');

    const fearIndicators = [];
    if (eyeContact < 40) fearIndicators.push("Frequent eye movements away from camera");
    if (metrics.detectedBehaviors?.gazeAvoidanceCount > 3) fearIndicators.push("Repeated gaze avoidance during answers");

    let anxietyLevel = "Low";
    if (metrics.detectedBehaviors?.fidgetCount >= 3 || headStability < 60) anxietyLevel = "High";
    else if (metrics.detectedBehaviors?.fidgetCount >= 1 || eyeContact < 55) anxietyLevel = "Medium";

    let conf = 7;
    if (eyeContact >= 70 && headStability >= 75 && avgQScore >= 6) conf = 9;
    else if (eyeContact < 45 || anxietyLevel === "High") conf = 4;

    nonVerbalAnalysis = {
      eyeContactScore: eyeContact,
      facePresenceScore: facePresence,
      headStabilityScore: headStability,
      headOrientationScore: headOrientation,
      trackingCoverage: trackingCoverage,
      dataReliability: reliability,
      behavioralSummary: `Candidate maintained ${eyeContact}% estimated eye contact and ${headStability}% head posture stability across ${metrics.validSamples || 0} valid tracking samples.`
    };

    behavioralIndicators = {
      confidenceScore: conf,
      anxietyLevel: anxietyLevel,
      fearIndicatorsDetected: fearIndicators,
      observations: `Observable physical telemetry showed ${eyeContact >= 65 ? 'consistent camera focus' : 'intermittent glance diversion'} and ${headStability >= 70 ? 'steady head positioning' : 'moderate head fidgeting'}.`
    };
  } else {
    nonVerbalAnalysis = {
      eyeContactScore: null,
      facePresenceScore: null,
      headStabilityScore: null,
      headOrientationScore: null,
      trackingCoverage: 0,
      dataReliability: "Unavailable",
      behavioralSummary: "MediaPipe vision telemetry was inactive or not recorded for this round. Behavioral assessment is inconclusive and does not affect the technical evaluation."
    };

    behavioralIndicators = {
      confidenceScore: Math.round(Math.min(Math.max(avgQScore, 3), 8)),
      anxietyLevel: "Low",
      fearIndicatorsDetected: [],
      observations: "Visual sensor data unavailable; behavioral assessment remains inconclusive without penalizing candidate marks."
    };
  }

  // Strengths and Areas for Improvement
  const strengths = [];
  const areasForImprovement = [];

  if (avgQScore >= 7) {
    strengths.push("Solid foundational command of key technical concepts");
    strengths.push("Clear, structured articulation of software architectural principles");
    strengths.push("Good pacing and systematic approach to complex engineering questions");
  } else if (avgQScore >= 4) {
    strengths.push("Demonstrated working awareness of core terminology and libraries");
    strengths.push("Completed multiple interview rounds under timed conditions");
    strengths.push("Showed potential to build upon foundational concepts with targeted practice");
  } else {
    strengths.push("Participated actively in the timed simulator session");
    strengths.push("Encountered realistic interview questions for targeted review");
  }

  if (nonAnswersCount > 0) {
    areasForImprovement.push("Avoid submitting greetings ('hi', 'hlo') or leaving questions unanswered");
    areasForImprovement.push("Prepare structured response templates (Situation, Architecture, Mechanism, Trade-off)");
  }
  if (totalWords / questionCount < 30) {
    areasForImprovement.push("Provide more comprehensive technical depth rather than single-sentence summaries");
  }
  areasForImprovement.push("Discuss production trade-offs such as database indexing, caching strategies, and latency");

  const actionableRecommendations = [
    "Practice using the STAR/CAR method to structure technical responses clearly.",
    "Review backend concurrency models, database transaction isolation levels, and caching patterns.",
    hasValidMetrics && nonVerbalAnalysis.eyeContactScore < 65
      ? "Practice delivering answers while looking directly at the webcam lens to convey steady engagement."
      : "Maintain your steady, articulate communication pace in future technical discussions."
  ];

  return {
    overallScore: weightedTechnicalScore,
    technicalScore: weightedTechnicalScore,
    technicalKnowledge: techKnowledge,
    answerRelevance: answerRelevance,
    communicationClarity: commClarity,
    problemSolving: problemSolving,
    nonVerbalAnalysis,
    behavioralIndicators,
    strengths: strengths.slice(0, 4),
    areasForImprovement: areasForImprovement.slice(0, 4),
    questionEvaluations,
    actionableRecommendations,
    finalSummary: avgQScore >= 7
      ? `The candidate demonstrated strong readiness for the ${experienceLevel} ${role} position, articulating technical mechanics with clarity.`
      : avgQScore >= 4
      ? `The candidate demonstrated foundational knowledge for ${role}, but needs to deepen their explanations of production edge cases and system mechanics.`
      : `The candidate struggled to provide relevant technical answers in this session. Dedicated practice on fundamental concepts and complete response formulation is recommended.`
  };
}

/**
 * Objective, rule-based behavioral analysis fallback.
 * Adheres strictly to non-diagnostic observations, no hallucinated metrics,
 * and handles missing MediaPipe telemetry without penalizing the candidate.
 */
function fallbackBehavioralAnalysis(verbalResponse, nonVerbalMetrics) {
  const verbalText = typeof verbalResponse === 'string' ? verbalResponse.trim() : '';
  const wordCount = verbalText ? verbalText.split(/\s+/).length : 0;
  const isVerbalSubstantial = wordCount >= 15;

  const hasMetrics = nonVerbalMetrics && typeof nonVerbalMetrics === 'object' && Object.keys(nonVerbalMetrics).length > 0;

  if (!hasMetrics) {
    return {
      confidence_score: isVerbalSubstantial ? 7 : 5,
      anxiety_level: "Low",
      fear_indicators_detected: [],
      behavioral_analysis: "The candidate's verbal response was clear and composed. However, because computer vision telemetry (MediaPipe) data was unavailable or incomplete for this session, the visual behavioral assessment is inconclusive. The candidate is not penalized for missing sensor data.",
      actionable_advice: [
        "Verify webcam visibility and lighting for optimal MediaPipe telemetry tracking.",
        "Continue articulating technical concepts clearly with steady pacing."
      ]
    };
  }

  const eyeContact = parseFloat(nonVerbalMetrics.eye_contact_pct ?? nonVerbalMetrics.eyeContact ?? 75);
  const faceDetected = parseFloat(nonVerbalMetrics.face_detection_pct ?? nonVerbalMetrics.facePresence ?? 90);
  const headStability = parseFloat(nonVerbalMetrics.head_stability_pct ?? nonVerbalMetrics.headStability ?? 80);
  const fidgetDetected = Boolean(nonVerbalMetrics.excessive_head_movement || nonVerbalMetrics.fidget_detected || nonVerbalMetrics.detectedBehaviors?.fidgetCount > 0);
  const backwardHead = Boolean(nonVerbalMetrics.sudden_backward_head_movement);
  const widenedEyes = Boolean(nonVerbalMetrics.widened_eyes);
  const eyebrowFurrowing = Boolean(nonVerbalMetrics.frequent_eyebrow_movements || nonVerbalMetrics.eyebrow_furrowing || nonVerbalMetrics.detectedBehaviors?.eyebrowFurrowCount > 0);
  const lipTightening = Boolean(nonVerbalMetrics.lip_biting || nonVerbalMetrics.lip_tightening || nonVerbalMetrics.detectedBehaviors?.lipTighteningCount > 0);
  const frequentPauses = Boolean(nonVerbalMetrics.frequent_pauses || wordCount < 8);

  const fearIndicators = [];
  if (eyeContact < 40) fearIndicators.push("Frequent eye movements looking away from camera");
  if (widenedEyes) fearIndicators.push("Widened eyes detected");
  if (backwardHead) fearIndicators.push("Sudden backward head movement detected");

  let anxietyLevel = "Low";
  let anxietyCount = 0;
  if (fidgetDetected) anxietyCount++;
  if (eyebrowFurrowing) anxietyCount++;
  if (lipTightening) anxietyCount++;
  if (frequentPauses) anxietyCount++;
  if (anxietyCount >= 3) {
    anxietyLevel = "High";
  } else if (anxietyCount >= 1) {
    anxietyLevel = "Medium";
  }

  let confidence = 7;
  if (eyeContact >= 70 && headStability >= 70 && isVerbalSubstantial) {
    confidence = Math.min(10, Math.round((eyeContact / 20) + (headStability / 25) + (isVerbalSubstantial ? 2 : 0)));
  } else if (eyeContact < 45 || fidgetDetected || anxietyLevel === "High") {
    confidence = Math.max(3, 7 - (anxietyCount * 1.5));
  }
  confidence = Math.max(1, Math.min(10, Math.round(confidence)));

  let analysis = "";
  if (isVerbalSubstantial && eyeContact >= 65) {
    analysis = "The candidate demonstrated consistent eye contact and stable head posture. Their verbal response was fluent and structured, which positively aligned with their steady non-verbal demeanor.";
  } else if (isVerbalSubstantial && eyeContact < 50) {
    analysis = "While the candidate provided a coherent and articulate verbal answer, computer vision telemetry recorded intermittent eye contact with the camera. There is an observable contrast between their verbal fluency and camera gaze consistency.";
  } else {
    analysis = "The candidate maintained moderate eye contact with stable facial expressions during the response. Observable behavioral indicators remained balanced across the interaction.";
  }

  if (fearIndicators.length > 0) {
    analysis += ` Observable indicators noted: ${fearIndicators.join(', ')}.`;
  } else {
    analysis += " No significant fear-related indicators were detected.";
  }

  const advice = [];
  if (eyeContact < 65) {
    advice.push("Maintain more consistent eye contact with the camera lens when presenting key ideas.");
  }
  if (fidgetDetected || headStability < 60) {
    advice.push("Practice answering with a grounded, relaxed head posture to convey steady physical composure.");
  }
  if (eyebrowFurrowing || lipTightening) {
    advice.push("Be mindful of subtle facial tension such as eyebrow furrowing during momentary pauses.");
  }
  if (advice.length === 0) {
    advice.push("Maintain consistent eye contact with the camera.");
    advice.push("Practice answering questions with a relaxed and stable posture.");
  }

  return {
    confidence_score: confidence,
    anxiety_level: anxietyLevel,
    fear_indicators_detected: fearIndicators,
    behavioral_analysis: analysis,
    actionable_advice: advice
  };
}

/**
 * Analyzes candidate verbal response and MediaPipe non-verbal metrics
 */
const analyzeBehavior = async (verbalResponse, nonVerbalMetrics) => {
  const userContent = buildBehavioralUserPrompt(verbalResponse, nonVerbalMetrics);

  if (GEMINI_API_KEY) {
    try {
      const geminiRes = await callGemini(userContent, BEHAVIORAL_ANALYSIS_SYSTEM_PROMPT);
      if (geminiRes && geminiRes.confidence_score !== undefined) {
        return geminiRes;
      }
    } catch (e) {}
  }

  try {
    const res = await callOllama(OLLAMA_CHAT_URL, {
      model: PRIMARY_MODEL,
      messages: [
        { role: 'system', content: BEHAVIORAL_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      stream: false,
      format: BEHAVIORAL_EVALUATION_SCHEMA
    }, 20000);

    if (res.ok) {
      const data = await res.json();
      const rawContent = data.message?.content || data.response || '{}';
      const parsed = extractJsonFromText(rawContent);
      if (parsed && parsed.confidence_score !== undefined) {
        return parsed;
      }
    }
  } catch (e) {}

  return fallbackBehavioralAnalysis(verbalResponse, nonVerbalMetrics);
};

module.exports = {
  generateQuestion,
  processInterviewerTurn,
  evaluateAnswer,
  evaluateFullInterview,
  analyzeBehavior,
  fallbackBehavioralAnalysis,
  extractJsonFromText,
  callGemini,
  callOllama,
  getCuratedQuestion,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  GEMINI_MODEL
};
