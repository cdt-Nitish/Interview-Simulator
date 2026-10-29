# 📊 Interview Simulator — Current Progress & Tech Stack

> **Project Name:** InterviewAI (AI Mock Interview Practice Platform)  
> **Status:** Prototype & Core Infrastructure Active (Frontend Complete, MySQL Database Pipeline Integrated, Core Auth Ready, Webcam Stream Integrated)  
> **Date:** October 2026  

---

## 🛠️ 1. Technology Stack

### 🌐 Frontend (Client-Side)
- **HTML5:** Semantic architecture including multi-section landing page (`index.html`), authentication modals, interactive fullscreen interview workstation, and diagnostic report modal. Standalone authentication page (`frontend/login.html`).
- **CSS3:** Custom responsive design system (`css/style.css`) using modern dark theme, CSS variables/tokens, glassmorphism, responsive grid and flexbox layouts, toasts, HUD telemetry visuals, and smooth transitions.
- **JavaScript (ES6+):** Vanilla modular client-side scripts:
  - `JS/auth.js`: Handles user authentication, session persistence, dual-mode API/localStorage fallback, validation, toasts, and UI sync.
  - `JS/camera.js`: Manages webcam lifecycle (`navigator.mediaDevices.getUserMedia`), video stream rendering, HUD status indicators, and session launch/end triggers.
  - `JS/dashboard.js`: Manages scroll interactions, navigation bar behavior, modal opening/closing, category selections, and dashboard metrics simulation.
- **Web APIs:**
  - `MediaDevices.getUserMedia()`: In-browser real-time video streaming with local camera controls.
  - `localStorage`: Client-side state caching and offline prototype mode.

---

### 🟢 Backend (Server-Side)
- **Runtime:** Node.js (CommonJS modules)
- **Web Framework:** Express.js (`v5.3.0`)
- **Session Management:** `express-session` (`v1.19.0`) with dedicated `MySQLSessionStore` (`Backend/config/sessionStore.js`) for persistent session storage in MySQL.
- **Security & Password Hashing:** `bcryptjs` (`v3.0.3`) for hashing passwords with 12 salt rounds.
- **Validation & Sanitization:** `express-validator` (`v7.3.2`) for server-side form validations.
- **Authentication & Tokens:** `jsonwebtoken` (`v9.0.3`) installed for JWT token generation.
- **CORS & Environment:** `cors` (`v2.8.6`) and `dotenv` (`v18.0.9`).
- **Development Tooling:** `nodemon` (`v3.1.14`) and Node native watch (`node --watch app.js`).

---

### 🗄️ Database & Storage (100% Relational MySQL)
- **MySQL 8.0+ (`mysql2 v3.24.6`):**
  - Database pool & automated schema initialization in `Backend/config/db.js`.
  - Schema definition script in `Database/schema.sql` covering 6 tables (`users`, `interviews`, `questions`, `answers`, `interview_metrics`, `sessions`).
  - Native MySQL User & Interview model entities with prepared statements in `Backend/models/`.
- **Browser LocalStorage:** Client-side cache for instant prototyping, local user accounts, and offline testing.

---

### 🤖 AI & Computer Vision (Architecture & Integrations)
- **Google Gemini AI API:** Designed for real-time question generation (by target role, difficulty, and type) and answer evaluation (scoring from 1 to 10, strengths, improvement areas, and suggestions).
- **Google MediaPipe:** Architecture configured for client-side face landmark and eye-contact gaze detection. Telemetry HUD and visual mesh crosshairs are set up in `index.html` and `css/style.css`.

---

## 📈 2. Current Progress Breakdown

| Module / Feature | Status | Details |
| :--- | :---: | :--- |
| **Landing Page & UI Design** | ✅ Complete | Fully designed hero section, feature showcase, workflow explanation, category cards, statistics counter, and footer. |
| **Candidate Auth UI** | ✅ Complete | Modal-based Login and Register forms with validation, error states, and a dedicated page (`frontend/login.html`). |
| **Client-Side Auth Manager** | ✅ Complete | `JS/auth.js` with session handling, modal controller, notification toast engine, and automatic backend/localStorage fallback. |
| **Webcam Integration** | ✅ Complete | `JS/camera.js` triggers browser webcam access on interview launch, handles stream toggles, fallback offline screens, and cleanup on session exit. |
| **Interview Workstation UI** | ✅ Complete | Fullscreen split layout (`#interviewScreen`) featuring active question pane, hints pills, live answer textarea, word/char counters, sample answer loader, and action controls. |
| **Vision HUD Overlay UI** | ✅ Complete | MediaPipe viewfinder frame, target bounding box, crosshairs, eye position indicators, and real-time telemetry meters (eye contact & face presence). |
| **Result & Diagnostic Report UI** | ✅ Complete | Comprehensive evaluation report modal (`#resultModal`) with overall score gauge, technical/communication breakdown bars, strengths & weaknesses lists, and question accordion. |
| **Express Server Core** | ✅ Complete | `app.js` configured with middleware, static file serving (`/css`, `/JS`, `/frontend`), health-check endpoint (`/api/health`), and MySQL session store. |
| **MySQL Database & Schemas** | ✅ Complete | Complete relational schema (`Database/schema.sql`), auto-initializing connection pool (`Backend/config/db.js`), and session store (`Backend/config/sessionStore.js`). |
| **MySQL User & Interview Models** | ✅ Complete | Fully implemented in `Backend/models/User.js` and `Backend/models/Interview.js` using parameterized queries. |
| **Backend Auth Controller & Routes** | ✅ Complete | Routes (`Backend/routes/authRoutes.js`) and controllers (`authController.js`) supporting MySQL storage, login, signup, session validation (`/api/auth/me`), and logout. |
| **MediaPipe Real-Time Landmark Pipeline**| 🔄 In Progress | Visual HUD and camera video are active; computing dynamic gaze/face angles next. |
| **Gemini AI Question Generation Engine** | ⏳ Planned | Connecting Gemini API to dynamically generate context-aware questions tailored to role and difficulty. |
| **Gemini AI Answer Evaluation Engine** | ⏳ Planned | Sending candidate answers to Gemini to receive structured scoring and detailed feedback. |

---

## 🗂️ 3. Project Directory Map

```
Interview-Simulator/
├── .env / .env.example       # Environment configuration (PORT, MYSQL_HOST, MYSQL_USER, etc.)
├── app.js                    # Express application entrypoint and MySQL session store
├── package.json              # Project dependencies (mysql2, express, bcryptjs)
├── current_progress.md       # Project status and tech stack tracking
├── README.md                 # Full project specification and architectural documentation
│
├── Backend/
│   ├── config/
│   │   ├── db.js             # MySQL connection pool & auto-table initialization
│   │   └── sessionStore.js   # Custom express-session store powered by MySQL
│   ├── controllers/
│   │   └── authController.js # MySQL signup, login, session /me, logout logic
│   ├── middleware/
│   │   └── authMiddleware.js # Session & auth gate middleware
│   ├── models/
│   │   ├── User.js           # MySQL User model with prepared statements
│   │   └── Interview.js      # MySQL Interview model
│   └── routes/
│       └── authRoutes.js     # Authentication route definitions
│
├── Database/
│   └── schema.sql            # MySQL relational schema (6 tables)
│
├── frontend/
│   └── login.html            # Standalone candidate access and login page
│
├── JS/
│   ├── auth.js               # Client authentication, toasts, local storage & MySQL session sync
│   ├── camera.js             # Webcam stream handler and session toggle
│   └── dashboard.js          # Navigation, modal controls, and mock metric populator
│
├── css/
│   └── style.css             # Main stylesheet (design tokens, layout, components, HUD)
│
└── index.html                # Main application landing page & interview simulator workspace
```
