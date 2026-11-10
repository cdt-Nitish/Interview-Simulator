# 🤖 InterviewAI — Relational Data Architecture & Workflow Guide

> An AI-powered mock interview platform built with **Node.js, Express, and MySQL 8.0+**.  
> This guide outlines the relational schema defined in `Database/schema.sql` and explains how records are generated, managed, and persisted from the application code.

---

## 📌 1. Database Architecture Overview

The platform uses a normalized relational database (`interview_simulator`) with foreign-key cascade rules and indexed lookup fields. All tables are defined in [`Database/schema.sql`](file:///c:/Users/Nitish%20Joshi/OneDrive/Desktop/Interview-simulator/Interview-Simulator/Database/schema.sql).

### Relational Entity-Relationship (ER) Flow
```text
[ users ]
   │
   ├── (1:N) ──► [ interviews ]
   │                  │
   │                  ├── (1:N) ──► [ questions ]
   │                  │                  │
   │                  │                  └── (1:N) ──► [ answers ] ◄── (1:N) ──┘
   │                  │
   │                  └── (1:1) ──► [ interview_metrics ]
   │
   └── (Auth) ──► [ sessions ]
```

---

## 🗄️ 2. Core Database Tables

### 1. `users`
Stores user profile information, authentication credentials, and candidate preferences:
* `id` (INT, PK, AUTO_INCREMENT): Unique candidate identifier.
* `first_name`, `last_name`: Candidate's legal name.
* `email` (VARCHAR(191), UNIQUE, INDEXED): Login username and contact.
* `password` (VARCHAR(255)): Bcrypt-hashed password (12 salt rounds).
* `role` (ENUM): Candidate access role (`candidate`, `interviewer`, `admin`).
* `target_role`: Primary career domain (e.g., Full Stack, Frontend, Backend).
* `experience_level`: Experience bracket (`Fresher / Entry`, `Mid-Level`, `Senior`).
* `created_at`, `updated_at`: Audit timestamps.

### 2. `interviews`
Tracks each distinct mock interview session:
* `id` (INT, PK, AUTO_INCREMENT): Interview session ID.
* `user_id` (INT, FK -> `users.id` ON DELETE CASCADE): Session owner.
* `role`: Specific position chosen for the practice session.
* `interview_type`: Category (`Technical`, `HR`, `Behavioral`).
* `difficulty`: Selected difficulty (`Easy`, `Medium`, `Hard`).
* `score`: Aggregated evaluation score (0.00 – 10.00).
* `status`: Lifecycle state (`pending`, `in_progress`, `completed`).
* `feedback`: Overall AI qualitative evaluation summary.

### 3. `questions`
Contains interview questions generated for a session:
* `id` (INT, PK, AUTO_INCREMENT): Unique question ID.
* `interview_id` (INT, FK -> `interviews.id` ON DELETE CASCADE): Parent interview.
* `question_text`: AI-generated prompt question.
* `question_order`: Sequence index in the interview workstation.

### 4. `answers`
Stores candidate responses and itemized scoring:
* `id` (INT, PK, AUTO_INCREMENT): Answer record ID.
* `question_id` (INT, FK -> `questions.id` ON DELETE CASCADE): Question reference.
* `user_id` (INT, FK -> `users.id` ON DELETE CASCADE): Candidate reference.
* `answer_text`: Candidate's verbatim or transcribed response.
* `score`: Question-level score evaluated by Qwen 3 (4B) / AI Evaluator.
* `feedback`: Targeted strengths, weaknesses, and improvement points.

### 5. `interview_metrics`
Logs computer-vision telemetry recorded via MediaPipe during the session:
* `id` (INT, PK, AUTO_INCREMENT): Metric record ID.
* `interview_id` (INT, FK -> `interviews.id` ON DELETE CASCADE): Session link.
* `face_detection_pct`: Percentage of time candidate was centered in frame.
* `eye_contact_pct`: Eye gaze contact ratio maintained during the round.

### 6. `sessions`
Provides persistent session state storage for Express:
* `session_id` (VARCHAR(128), PK): Express session identifier.
* `expires` (INT UNSIGNED, INDEXED): UNIX expiration timestamp.
* `data` (MEDIUMTEXT): Serialized session payload (logged-in user context).

---

## ⚙️ 3. How Data is Created in VS Code

When running the project locally in VS Code, data flows through modular layers:

```text
[ Frontend / Client UI ]
           │
           ▼ (HTTP JSON / Form Post)
[ Express Routes & Controllers ]  ──► (Backend/controllers/authController.js)
           │
           ▼ (Parameterized Queries)
[ Native MySQL Models ]           ──► (Backend/models/User.js, Interview.js)
           │
           ▼ (mysql2 Connection Pool)
[ MySQL 8.0+ Database Server ]   ──► (Database/schema.sql tables)
```

### Data Creation Flow Step-by-Step

#### Step 1: Automated Database Bootstrapping
* **File:** `Backend/config/db.js`
* **Trigger:** Server startup (`node app.js` or `npm start`).
* **Action:** Executes `CREATE DATABASE IF NOT EXISTS interview_simulator` followed by table creation statements from `TABLE_DEFINITIONS`. The database and tables are provisioned automatically without manual CLI commands.

#### Step 2: User Registration & Credential Hashing
* **Files:** `frontend/login.html` & `JS/auth.js` ➔ `Backend/controllers/authController.js` ➔ `Backend/models/User.js`
* **Trigger:** Submitting the registration form (`POST /signup`).
* **Action:**
  1. Input validation runs via `express-validator`.
  2. Password is salted and hashed using `bcrypt.hash(password, 12)`.
  3. `User.create()` runs an `INSERT INTO users (...) VALUES (...)` statement.
  4. The returned `insertId` establishes the primary key for the new candidate.

#### Step 3: Session Persistence
* **Files:** `Backend/config/sessionStore.js` ➔ `app.js`
* **Trigger:** Successful login or signup.
* **Action:** The custom `MySQLSessionStore` executes a `REPLACE INTO sessions (session_id, expires, data)` query, storing authentication state in MySQL with a 7-day TTL.

#### Step 4: Interview Session Initialization
* **Files:** `Backend/models/Interview.js` ➔ Client Setup Modal
* **Trigger:** Candidate selects a role/difficulty and clicks "Start Interview".
* **Action:** An `INSERT INTO interviews (user_id, role, interview_type, difficulty, status)` query creates a new row with `status = 'in_progress'` linked to the logged-in `user_id`.

#### Step 5: Question Generation & Answer Scoring (Qwen 3 4B)
* **Files:** `Backend/services/qwenService.js` & `JS/interview.js` ➔ `Backend/controllers/interviewController.js`
* **Trigger:** Candidate starts interview; Qwen 3 (4B) generates questions; candidate submits answers.
* **Action:**
  1. Questions are generated via Ollama (`qwen3:4b`) and inserted into `questions` with their sequence order.
  2. Candidate submissions trigger evaluation via Qwen 3 (4B) and inserts into `answers` containing `answer_text`, numeric score (1–10), and structured feedback (`strengths`, `weaknesses`, `followUpQuestion`).
  3. Real-time feedback appears in `#feedbackBox` and accumulates into `#resultModal` at round completion.

#### Step 6: Telemetry & Metrics Storage
* **Files:** `JS/camera.js` & Vision HUD ➔ Metric Endpoints
* **Trigger:** Interview completion.
* **Action:** Aggregated MediaPipe face and eye tracking percentages are inserted into `interview_metrics`. Final scores are calculated and updated in `interviews`.

---

## 🚀 4. How to Run & Verify in VS Code

1. **Configure Environment Variables:**
   Update database credentials in `.env`:
   ```env
   PORT=3000
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=interview_simulator
   ```

2. **Start the Application:**
   ```bash
   npm run dev
   # or
   node app.js
   ```

3. **Verify Connection & Health:**
   Open browser at `http://localhost:3000/api/health` to confirm MySQL connectivity:
   ```json
   {
     "status": "online",
     "database": "MySQL 8.0+",
     "databaseConnected": true
   }
   ```

---

## 🧠 5. AI Mock Interview – Behavioral Analysis System & Prompt

InterviewAI includes a multimodal behavioral analysis engine that evaluates candidate interview performance by synthesizing two real-time inputs:
1. **Verbal Response:** Spoken candidate answer captured and converted into text via speech-to-text.
2. **Non-Verbal Metrics:** Facial landmark telemetry and head movement dynamics tracked via MediaPipe and computer vision.

```text
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     Verbal Spoken Response      │       │     Non-Verbal Visual Data      │
│  (Speech-to-Text Transcription) │       │   (MediaPipe CV Landmark HUD)   │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │                                         │
                 └───────────────────┬─────────────────────┘
                                     │
                                     ▼
                ┌─────────────────────────────────────────┐
                │   AI Behavioral Analysis Assistant      │
                │     (Qwen 3 4B / Ollama Engine)         │
                └────────────────────┬────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ 1. Confidence    │       │ 2. Anxiety Level │       │ 3. Fear          │
│    Score (1-10)  │       │ (Low/Med/High)   │       │    Indicators    │
└──────────────────┘       └──────────────────┘       └──────────────────┘
                                     │
                                     ▼
                   ┌───────────────────────────────────┐
                   │    Verbal vs Non-Verbal Synthesis │
                   │       + Actionable Advice         │
                   └───────────────────────────────────┘
```

### 📋 The Behavioral Analysis System Prompt

The AI evaluation engine operates under this strict system prompt definition located at [`Backend/prompts/behavioralPrompt.js`](file:///c:/Users/Nitish%20Joshi/OneDrive/Desktop/Interview-simulator/Interview-Simulator/Backend/prompts/behavioralPrompt.js):

```markdown
# AI Mock Interview – Behavioral Analysis Prompt

You are an expert AI interview evaluator and behavioral analysis assistant. Your task is to evaluate a candidate's mock interview performance using two inputs:

1. **Verbal Response:** The candidate's spoken answer converted into text using speech-to-text.
2. **Non-Verbal Metrics:** Facial and head movement data captured using MediaPipe and computer vision.

Analyze the candidate's overall interview behavior by focusing on three important emotional indicators: Confidence, Anxiety, and Fear.

### 1. Confidence Analysis
Evaluate the following indicators:
- Consistent eye contact with the camera.
- Neutral or naturally smiling facial expressions.
- Stable head posture.
- Minimal unnecessary facial movements.
- Clear and composed verbal responses.

### 2. Fear Analysis
Look for the following possible indicators:
- Frequent eye movements or looking away from the camera.
- Widened eyes.
- Sudden backward head movements.
- Hesitation or difficulty maintaining a response.

### 3. Anxiety Analysis
Evaluate these behaviors:
- Frequent eyebrow movements or furrowing.
- Lip biting or tightening.
- Excessive head movement or fidgeting.
- Repeated changes in facial expressions.
- Frequent pauses or hesitation while speaking.

### 4. Verbal and Non-Verbal Comparison
Compare the candidate's spoken response with their observed facial behavior.

For example:
- If the candidate gives a confident answer but frequently avoids eye contact, mention the mismatch.
- If the candidate speaks fluently and maintains stable eye contact, identify this as positive interview behavior.
- If the candidate hesitates while showing repeated facial movements, mention these observations.

Do not assume that facial expressions accurately reveal a person's internal emotional state. Describe observable behaviors and treat emotional interpretations as possibilities, not psychological diagnoses.

### 5. Scoring Guidelines

Generate the following scores:

- **Confidence Score:** 1–10 (higher means stronger observable confidence-related behavior).
- **Anxiety Level:** Low, Medium, or High.
- **Fear Indicators:** List only the behaviors actually detected.
- If sufficient data is unavailable, clearly mention that the assessment is inconclusive instead of inventing observations.

### 6. Output Format

Return ONLY valid JSON. Do not include Markdown formatting, explanations outside JSON, or additional text.

{
  "confidence_score": 8,
  "anxiety_level": "Low",
  "fear_indicators_detected": [],
  "behavioral_analysis": "The candidate maintained relatively stable eye contact and a steady head posture. Their verbal responses were clear and composed, which was consistent with their observed behavior. No significant fear-related indicators were detected.",
  "actionable_advice": [
    "Maintain consistent eye contact with the camera.",
    "Practice answering questions with a relaxed and stable posture."
  ]
}

### Important Instructions
- Analyze only the metrics and transcript provided by the system.
- Never invent facial expressions or movements that were not detected.
- Do not confuse normal blinking with fear or anxiety.
- Consider cultural differences and individual variations in facial expressions.
- Missing or unreliable MediaPipe data must not be treated as negative behavior.
- Keep the analysis professional, objective, and useful for interview preparation.
- Provide constructive advice rather than criticizing the candidate.
```

---

### 🔍 Key Emotional Indicators & Observable Metrics

| Category | Primary Indicators Evaluated | Observable Telemetry Triggers |
| :--- | :--- | :--- |
| **1. Confidence Analysis** | Consistent eye contact, stable head posture, minimal facial movements, composed delivery. | `eye_contact_pct >= 70%`, `head_stability_pct >= 75%`, low fidget count, fluid speech delivery. |
| **2. Fear Analysis** | Frequent glance avoidance, widened eyes, abrupt backward head jerks, verbal paralysis. | `widened_eyes = true`, `sudden_backward_head_movement = true`, severe gaze diversion (`eye_contact_pct < 40%`). |
| **3. Anxiety Analysis** | Eyebrow furrowing, lip compression/biting, excessive fidgeting, frequent long pauses. | `frequent_eyebrow_movements = true`, `lip_tightening = true`, `excessive_head_movement = true`, high pause frequency. |

---

### 🛡️ Ethical & Operational Guardrails
1. **Observable Behaviors Only:** All evaluations report visible physical telemetry (e.g., eye gaze ratio, head stabilization) rather than claiming psychological or emotional absolute truth.
2. **Missing Telemetry Safety:** If MediaPipe telemetry is unavailable or camera permissions were blocked, the system flags the non-verbal assessment as **inconclusive** and **never penalizes the candidate**.
3. **No False Positives on Normal Blinking:** Natural human eye blink rates are never misclassified as anxiety or fear.
4. **Constructive Preparation:** Feedback is framed supportively to build candidate interview readiness.

---

### 🌐 Behavioral Analysis API Integration

#### Endpoint: `POST /api/interviews/behavior/analyze` (or `POST /api/interviews/:interviewId/behavior/analyze`)

**Request Payload:**
```json
{
  "interviewId": 14,
  "verbalResponse": "In our microservices architecture, we handled distributed state with Kafka event queues and Redis caching to keep database load low and latency under 50 milliseconds.",
  "nonVerbalMetrics": {
    "face_detection_pct": 98.4,
    "eye_contact_pct": 82.5,
    "head_stability_pct": 89.0,
    "excessive_head_movement": false,
    "sudden_backward_head_movement": false,
    "widened_eyes": false,
    "frequent_eyebrow_movements": false,
    "lip_tightening": false,
    "frequent_pauses": false
  }
}
```

**Response Payload (HTTP 200 OK):**
```json
{
  "success": true,
  "interviewId": 14,
  "analysis": {
    "confidence_score": 9,
    "anxiety_level": "Low",
    "fear_indicators_detected": [],
    "behavioral_analysis": "The candidate maintained consistent eye contact and stable head posture. Their verbal response was fluent and structured, which positively aligned with their steady non-verbal demeanor. No significant fear-related indicators were detected.",
    "actionable_advice": [
      "Maintain consistent eye contact with the camera.",
      "Practice answering questions with a relaxed and stable posture."
    ]
  }
}
```
