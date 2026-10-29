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
* `score`: Question-level score evaluated by Gemini AI.
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

#### Step 5: Question Generation & Answer Scoring
* **Trigger:** Gemini AI generates questions; candidate submits answers.
* **Action:**
  1. Questions are inserted into `questions` with their sequence order.
  2. Candidate submissions trigger inserts into `answers` containing `answer_text`, Gemini AI score, and feedback text.

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

