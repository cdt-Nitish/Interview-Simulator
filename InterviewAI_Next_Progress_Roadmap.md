# 🎯 InterviewAI --- Next-Phase Roadmap

> **Goal:** Turn the current working prototype into an adaptive AI mock
> interview.\
> **Current stage:** Frontend, authentication, MySQL pipeline and webcam
> UI are in place.\
> **Next focus:** MediaPipe measurements → Qwen AI integration →
> adaptive interview → testing → deployment.

------------------------------------------------------------------------

## 🧭 1. Where We Are

  Module                                          Current status
  ----------------------------------------------- ----------------
  Landing page, workstation & report UI           ✅ Complete
  Login/register, Express sessions & MySQL auth   ✅ Core ready
  MySQL schema and models                         ✅ Integrated
  Webcam stream and visual HUD                    ✅ Working
  MediaPipe gaze/face-angle calculations          🔄 In progress
  Qwen3-4B question generation                    ⏳ Next
  Answer evaluation and adaptive follow-ups       ⏳ Planned
  End-to-end tests and deployment                 ⏳ Planned

**AI decision:** Use **Ollama + Qwen3-4B locally first**. Gemini is not
currently configured with an API key. Keep the AI code modular so a
hosted model can be added later if needed.

## 🗺️ 2. Roadmap at a Glance

``` mermaid
flowchart TD
    A["1. Finish MediaPipe signals"] --> B["2. Connect Ollama + Qwen3-4B"]
    B --> C["3. Generate the first question"]
    C --> D["4. Evaluate the candidate answer"]
    D --> E["5. Adapt and generate next question"]
    E --> F["6. Save every turn in MySQL"]
    F --> G["7. Test the full interview"]
    G --> H["8. Choose deployment strategy"]
    classDef done fill:#d9fbe5,stroke:#16803c,color:#123;
    classDef next fill:#dbeafe,stroke:#2563eb,color:#123;
    class A done;
    class B next;
```

------------------------------------------------------------------------

## 🚀 3. Build in This Order

### Phase 1 --- Finish MediaPipe basics

-   Calculate and smooth face presence, approximate gaze direction and
    head movement.
-   Update the existing HUD with measured values instead of simulated
    metrics.
-   Add a clear **camera unavailable** state.
-   Keep visual signals separate from answer scoring.

**Done when:** camera signals update live and the interview still works
without camera permission.

### Phase 2 --- Connect Qwen3-4B to Express

-   Confirm this works in Command Prompt:
    `ollama run qwen3:4b "Reply with only: Hello"`.
-   Install the Node client in the project: `npm install ollama`.
-   Add `Backend/services/ollamaService.js`.
-   Add an AI route/controller that calls the service.
-   Keep model name and options in `.env`; never call Ollama directly
    from frontend JavaScript.

**Local development:** Express calls `http://127.0.0.1:11434`. If Ollama
is stopped, show a useful error and retry option.

**Done when:** a frontend request receives one valid AI-generated
question.

### Phase 3 --- Build the adaptive interview loop

``` mermaid
flowchart TD
    A["Start interview"] --> B["Generate 1 question"]
    B --> C["Candidate submits answer"]
    C --> D["Qwen evaluates answer"]
    D --> E{"Answer quality"}
    E -->|"Strong"| F["Ask a deeper follow-up"]
    E -->|"Partial"| G["Probe the missing concept"]
    E -->|"Incorrect / unclear"| H["Ask a simpler question or clarify"]
    F --> I["Save turn in MySQL"]
    G --> I
    H --> I
    I --> J{"Interview finished?"}
    J -->|"No"| B
    J -->|"Yes"| K["Show final report"]
```

-   Ask **one question at a time**; do not pre-generate a fixed list.
-   Use role, topic, difficulty, prior questions and the latest answer
    as context.
-   Evaluate correctness, relevance, completeness and reasoning using
    one consistent rubric.
-   Use answer quality as the main difficulty signal.
-   Treat gaze/head movement as presentation cues---not proof of
    confidence or knowledge.
-   Validate Qwen's response before using it in the UI or database.

**Done when:** each answer gets feedback and a relevant next question,
without repeating earlier questions.

### Phase 4 --- Save the full session in MySQL

Use the existing six-table schema first; **do not create duplicate
tables without inspecting `Database/schema.sql`**.

Map the interview flow to the current tables: - `users` --- candidate
account - `interviews` --- session settings, status and timestamps -
`questions` --- generated question and sequence - `answers` ---
candidate response - `interview_metrics` --- measured
session/presentation metrics - `sessions` --- persistent Express login
sessions

Check the actual columns and foreign keys before writing queries. Use
parameterized SQL and preserve the existing schema.

**Done when:** refreshing the page does not erase saved interview
history or results.

### Phase 5 --- Connect the existing UI

-   Wire the workstation controls to the new Express endpoints.
-   Add loading, error, retry and submit-disabled states.
-   Show question number and interview progress.
-   Fill the existing diagnostic report with saved evaluation results.
-   Prevent duplicate submissions from creating duplicate turns.

**Done when:** a candidate can complete an interview from start to final
report through the UI.

### Phase 6 --- Test, then deploy

-   Test strong, partial, incorrect, empty and very long answers.
-   Test Qwen unavailable, MySQL unavailable, camera denied and page
    refresh.
-   Compare Qwen3-1.7B and Qwen3-4B on the same sample answers for
    quality and response time.
-   Record repeated questions, malformed AI output and latency.
-   Keep AI feedback as practice guidance, not a definitive hiring
    score.

**Deployment reality:** local Ollama works only while the PC and model
are running. For a public site that works when the PC is off, host Qwen
on an always-on server with sufficient resources or later add a hosted
AI provider. Do not expose Ollama's local port publicly.

------------------------------------------------------------------------

## 🧱 4. Suggested Files to Add

Fit these into the existing repository; avoid reorganizing working files
unnecessarily.

``` text
Backend/
├── services/
│   ├── ollamaService.js       # Calls Qwen through Ollama
│   └── evaluationService.js   # Validates score and feedback
├── controllers/
│   └── interviewController.js # Start, answer, next question, finish
├── routes/
│   └── interviewRoutes.js     # Interview API endpoints
└── models/
    └── Interview.js           # Extend existing model if needed
```

Suggested API flow:

  ------------------------------------------------------------------------
  Endpoint                             Purpose
  ------------------------------------ -----------------------------------
  `POST /api/interviews`               Start session + generate first
                                       question

  `POST /api/interviews/:id/answers`   Save answer, evaluate it, return
                                       next question

  `GET /api/interviews/:id`            Load session state

  `POST /api/interviews/:id/finish`    Finish and prepare report

  `GET /api/interviews/:id/results`    Read saved report
  ------------------------------------------------------------------------

Adapt these paths to the existing routing conventions.

## 📊 5. Definition of Done

A demo is ready when the user can:

-   [ ] Sign in using the existing MySQL-backed authentication.
-   [ ] Start an interview and receive one generated question.
-   [ ] Submit an answer and receive structured feedback.
-   [ ] Get a relevant follow-up based on the previous answer.
-   [ ] See camera signals separately from technical scoring.
-   [ ] Finish the interview and view a saved report.
-   [ ] Refresh the page without losing the session.
-   [ ] Recover gracefully if AI, database or camera access fails.

## ✅ Your Next 3 Actions

1.  **Fix/verify Qwen generation** with the one-line terminal test.
2.  **Create `Backend/services/ollamaService.js`** and test it
    independently.
3.  **Build one Express endpoint** that returns the first interview
    question.

After that, implement answer evaluation and the adaptive loop. Keep each
phase small, testable and committed to GitHub.

### References

-   [Ollama Qwen3 models](https://ollama.com/library/qwen3)
-   [Ollama API docs](https://docs.ollama.com/api)
-   [MySQL documentation](https://dev.mysql.com/doc/)
-   [MediaPipe
    documentation](https://ai.google.dev/edge/mediapipe/solutions/guide)
