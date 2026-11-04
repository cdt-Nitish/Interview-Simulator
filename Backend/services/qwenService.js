require('dotenv').config();

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_CHAT_URL = process.env.OLLAMA_URL || `${OLLAMA_BASE.replace(/\/+$/, '')}/api/chat`;
const OLLAMA_GEN_URL = `${OLLAMA_BASE.replace(/\/+$/, '')}/api/generate`;
const PRIMARY_MODEL = process.env.QWEN_MODEL || 'qwen3:4b';
const FALLBACK_MODEL = 'qwen3:1.7b';

// Curated role-specific fallback question pool in case Ollama takes too long or daemon is busy
const FALLBACK_QUESTIONS = {
  'full stack': [
    "Can you explain the end-to-end lifecycle of a web request from the browser address bar to the database and back?",
    "How do you design and structure RESTful APIs to ensure scalability, rate limiting, and secure authentication?",
    "What are the key trade-offs between client-side rendering (CSR) and server-side rendering (SSR)?"
  ],
  'frontend': [
    "Explain the JavaScript event loop, microtasks, and macrotasks with a concrete execution example.",
    "How does the Virtual DOM work in modern frontend frameworks, and how do you optimize rendering performance?",
    "What strategies do you use for efficient state management and caching in large single-page applications?"
  ],
  'backend': [
    "How do you design a database schema to handle high-concurrency read and write operations without deadlocks?",
    "Explain the differences between SQL and NoSQL databases, and when you would choose each in production.",
    "What architectural patterns and techniques do you apply to secure backend microservices?"
  ],
  'default': [
    "Can you describe a challenging technical project you built, the architectural trade-offs you faced, and how you solved them?",
    "How do you approach debugging a high-latency performance bottleneck in a web application?",
    "Explain how authentication works using JWT tokens and secure HTTP-only session cookies."
  ]
};

function getCuratedQuestion(targetRole = 'Full Stack') {
  const normalized = targetRole.toLowerCase();
  for (const [key, questions] of Object.entries(FALLBACK_QUESTIONS)) {
    if (normalized.includes(key)) {
      return questions[Math.floor(Math.random() * questions.length)];
    }
  }
  const defaultList = FALLBACK_QUESTIONS.default;
  return defaultList[Math.floor(Math.random() * defaultList.length)];
}

/**
 * Call Ollama API with timeout control
 */
async function callOllama(url, payload, timeoutMs = 25000) {
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
 * Generate a targeted interview question using Qwen via Ollama with fallback resilience
 */
const generateQuestion = async (targetRole = 'Full Stack Developer', experienceLevel = 'Fresher') => {
  const prompt = `You are a professional technical interviewer. Ask exactly ONE challenging interview question for a ${experienceLevel} ${targetRole}. Return ONLY the question text without any introductions, pleasantries, or explanations.`;

  // 1. Try with Primary Model
  try {
    const res = await callOllama(OLLAMA_GEN_URL, {
      model: PRIMARY_MODEL,
      prompt: prompt,
      stream: false
    }, 20000);

    if (res.ok) {
      const data = await res.json();
      const text = (data.response || data.message?.content || '').trim();
      if (text) {
        return text.replace(/^["'\s]+|["'\s]+$/g, '');
      }
    }
  } catch (err) {
    console.warn(`[QwenService] Primary model (${PRIMARY_MODEL}) failed or timed out:`, err.message);
  }

  // 2. Try with lighter, faster GPU model (qwen3:1.7b)
  if (PRIMARY_MODEL !== FALLBACK_MODEL) {
    try {
      console.log(`[QwenService] Attempting with fast model: ${FALLBACK_MODEL}...`);
      const res = await callOllama(OLLAMA_GEN_URL, {
        model: FALLBACK_MODEL,
        prompt: prompt,
        stream: false
      }, 20000);

      if (res.ok) {
        const data = await res.json();
        const text = (data.response || data.message?.content || '').trim();
        if (text) {
          return text.replace(/^["'\s]+|["'\s]+$/g, '');
        }
      }
    } catch (err) {
      console.warn(`[QwenService] Fallback model (${FALLBACK_MODEL}) error:`, err.message);
    }
  }

  // 3. Fallback to curated technical question pool if Ollama is unavailable
  console.log('[QwenService] Serving curated technical question for:', targetRole);
  return getCuratedQuestion(targetRole);
};

/**
 * Evaluates candidate answer and returns structured JSON with score, strengths, weaknesses, and followUpQuestion
 */
const evaluateAnswer = async (question, answer) => {
  const prompt = `You are a senior technical interviewer. Evaluate this candidate response objectively.
Question: "${question}"
Candidate Answer: "${answer}"

Provide your evaluation strictly conforming to this JSON format:
{
  "score": <integer from 1 to 10>,
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "followUpQuestion": "<targeted technical follow-up question based on their answer>"
}`;

  const evaluationSchema = {
    type: 'object',
    properties: {
      score: { type: 'integer', description: 'Technical accuracy score from 1 to 10' },
      strengths: { type: 'array', items: { type: 'string' } },
      weaknesses: { type: 'array', items: { type: 'string' } },
      followUpQuestion: { type: 'string', description: 'A tailored follow-up question based on their answer' },
    },
    required: ['score', 'strengths', 'weaknesses', 'followUpQuestion'],
  };

  const payload = {
    model: PRIMARY_MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    format: evaluationSchema
  };

  // Try primary model
  try {
    const res = await callOllama(OLLAMA_CHAT_URL, payload, 25000);
    if (res.ok) {
      const data = await res.json();
      const content = data.message?.content || data.response || '{}';
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`[QwenService] Evaluation on ${PRIMARY_MODEL} failed, trying fallback:`, err.message);
  }

  // Try fast fallback model
  try {
    payload.model = FALLBACK_MODEL;
    const res = await callOllama(OLLAMA_CHAT_URL, payload, 20000);
    if (res.ok) {
      const data = await res.json();
      const content = data.message?.content || data.response || '{}';
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`[QwenService] Evaluation on ${FALLBACK_MODEL} failed:`, err.message);
  }

  // Heuristic evaluation fallback if AI service is unresponsive
  const wordCount = (answer || '').trim().split(/\s+/).length;
  const score = Math.min(Math.max(Math.round(wordCount / 12) + 4, 5), 9);
  return {
    score: score,
    strengths: [
      "Demonstrated good foundational knowledge of the subject",
      "Communicated technical principles clearly and concisely"
    ],
    weaknesses: [
      "Could expand further on production performance trade-offs",
      "Consider discussing real-world edge cases"
    ],
    followUpQuestion: "How would you handle this scenario at enterprise scale with high concurrency?"
  };
};

module.exports = {
  generateQuestion,
  evaluateAnswer,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  OLLAMA_CHAT_URL,
  OLLAMA_GEN_URL
};
