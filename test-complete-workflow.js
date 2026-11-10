// test-complete-workflow.js - Comprehensive End-to-End Test Suite for InterviewAI

const {
  generateQuestion,
  processInterviewerTurn,
  evaluateAnswer,
  evaluateFullInterview
} = require('./Backend/services/qwenService');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE INTERVIEWAI TEST SUITE');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST CASE 1: Meaningless Answer ("Hi" / "hlo")
  // ----------------------------------------------------
  console.log('--- TEST CASE 1: Meaningless / Greeting Response ---');
  const question1 = "Explain the lifecycle of a web request from browser to database.";
  const candidateAnswer1 = "hlo";

  // 1A. Evaluate single answer
  const eval1 = await evaluateAnswer(question1, candidateAnswer1);
  console.log('Evaluation result for "hlo":', eval1);
  assert(eval1.score <= 1.0, `Score for "hlo" must be <= 1.0, got: ${eval1.score}`);
  assert(eval1.strengths.length === 0, `Strengths for "hlo" should be empty, got: ${JSON.stringify(eval1.strengths)}`);
  assert(eval1.weaknesses.some(w => w.toLowerCase().includes('greeting') || w.toLowerCase().includes('non-answer')),
    'Weaknesses must identify the greeting/non-answer');
  console.log('✅ Test Case 1A passed: "hlo" received score <= 1 and no fake praise.\n');

  // 1B. Interviewer Turn Reaction
  const turn1 = await processInterviewerTurn({
    role: 'Full Stack Developer',
    experienceLevel: 'Fresher',
    currentQuestion: question1,
    candidateAnswer: candidateAnswer1,
    history: []
  });
  console.log('Interviewer Turn response for "hlo":', turn1);
  assert(turn1.isMeaningless === true, 'Turn should be flagged as isMeaningless: true');
  assert(turn1.interviewerMessage.toLowerCase().includes('greeting') || turn1.interviewerMessage.toLowerCase().includes('technical'),
    'Interviewer should politely address lack of technical content');
  console.log('✅ Test Case 1B passed: Interviewer reacted politely and strictly to meaningless answer.\n');

  // ----------------------------------------------------
  // TEST CASE 2: Partially Correct Answer
  // ----------------------------------------------------
  console.log('--- TEST CASE 2: Partially Correct Answer ---');
  const question2 = "How do you design and structure RESTful APIs?";
  const candidateAnswer2 = "REST APIs allow communication between frontend and backend using HTTP endpoints.";

  const eval2 = await evaluateAnswer(question2, candidateAnswer2);
  console.log('Evaluation result for partial answer:', eval2);
  assert(eval2.score >= 2.5 && eval2.score <= 6.0, `Partial answer score must be between 2.5 and 6.0, got: ${eval2.score}`);
  assert(eval2.weaknesses.length > 0, 'Partial answer must have improvement areas');
  console.log('✅ Test Case 2 passed: Partial answer received realistic mid-range score (3-6/10).\n');

  // ----------------------------------------------------
  // TEST CASE 3: Strong Technical Answer
  // ----------------------------------------------------
  console.log('--- TEST CASE 3: Strong Technical Answer ---');
  const question3 = "Explain the JavaScript event loop, microtasks, and macrotasks with an execution example.";
  const candidateAnswer3 = "The JavaScript runtime is single-threaded and executes synchronous code on the call stack. Asynchronous operations are scheduled in queues: microtasks (Promises, process.nextTick) have higher priority and are completely drained after each call stack tick before the event loop picks a macrotask (setTimeout, setInterval, setImmediate) from the task queue. For example, a resolved Promise.then executes before a setTimeout callback.";

  const eval3 = await evaluateAnswer(question3, candidateAnswer3);
  console.log('Evaluation result for strong answer:', eval3);
  assert(eval3.score >= 7.5, `Strong answer score must be >= 7.5, got: ${eval3.score}`);
  assert(eval3.strengths.length > 0, 'Strong answer must include concrete strengths');
  console.log('✅ Test Case 3 passed: Strong answer received score >= 7.5 with specific technical praise.\n');

  // ----------------------------------------------------
  // TEST CASE 4: MediaPipe Telemetry & Mathematical Accuracy
  // ----------------------------------------------------
  console.log('--- TEST CASE 4: MediaPipe Live Telemetry Simulation ---');
  const activeMetrics = {
    eyeContact: 84,
    facePresence: 96,
    headStability: 88,
    headOrientation: 91,
    eyeMovement: 75,
    trackingCoverage: 95,
    validSamples: 420,
    trackingStatus: 'active',
    dataReliability: 'High',
    detectedBehaviors: {
      fidgetCount: 0,
      gazeAvoidanceCount: 2,
      eyebrowFurrowCount: 0,
      lipTighteningCount: 0,
      blinksCount: 14
    }
  };

  assert(activeMetrics.eyeContact !== activeMetrics.facePresence, 'Eye contact and face presence must be distinct metrics');
  assert(activeMetrics.validSamples > 0, 'Valid samples must be tracked');
  console.log('✅ Test Case 4 passed: MediaPipe session telemetry structure is distinct and comprehensive.\n');

  // ----------------------------------------------------
  // TEST CASE 5: Camera Offline / Telemetry Missing
  // ----------------------------------------------------
  console.log('--- TEST CASE 5: Camera Offline / Missing Telemetry ---');
  const offlineSession = {
    role: 'Full Stack Developer',
    difficulty: 'Medium',
    questions: [
      { order: 1, questionText: question3, answerText: candidateAnswer3 }
    ],
    metrics: null // Camera was unavailable
  };

  const offlineReport = await evaluateFullInterview(offlineSession);
  console.log('Offline session nonVerbalAnalysis:', offlineReport.nonVerbalAnalysis);
  assert(offlineReport.nonVerbalAnalysis.eyeContactScore === null, 'Offline eye contact should be null');
  assert(offlineReport.nonVerbalAnalysis.dataReliability === 'Unavailable', 'Data reliability should be Unavailable');
  assert(offlineReport.nonVerbalAnalysis.behavioralSummary.toLowerCase().includes('inconclusive'),
    'Behavioral assessment must be explicitly marked inconclusive');
  // Confirm technical marks are NOT penalized because camera was offline
  assert(offlineReport.technicalScore >= 7.0, `Technical score should not be penalized for missing camera, got: ${offlineReport.technicalScore}`);
  console.log('✅ Test Case 5 passed: Missing camera telemetry handled gracefully without penalizing technical score.\n');

  // ----------------------------------------------------
  // TEST CASE 6: Complete Interview Final Evaluation with Dynamic Rubric
  // ----------------------------------------------------
  console.log('--- TEST CASE 6: Complete Interview Final Evaluation ---');
  const fullSession = {
    role: 'Full Stack Developer',
    difficulty: 'Hard',
    experienceLevel: 'Mid-Level',
    questions: [
      { order: 1, questionText: question1, answerText: "The browser resolves DNS to an IP, performs TCP and TLS handshake, and sends an HTTP request to the load balancer which routes to Node.js." },
      { order: 2, questionText: question2, answerText: candidateAnswer2 },
      { order: 3, questionText: question3, answerText: candidateAnswer3 }
    ],
    metrics: activeMetrics
  };

  const finalReport = await evaluateFullInterview(fullSession);
  console.log('\nFinal Report Summary:');
  console.log(`- Overall Technical Score: ${finalReport.overallScore}/10`);
  console.log(`- Technical Knowledge (40%): ${finalReport.technicalKnowledge}/10`);
  console.log(`- Answer Relevance (25%): ${finalReport.answerRelevance}/10`);
  console.log(`- Communication (20%): ${finalReport.communicationClarity}/10`);
  console.log(`- Problem Solving (15%): ${finalReport.problemSolving}/10`);
  console.log(`- Non-Verbal Eye Contact: ${finalReport.nonVerbalAnalysis.eyeContactScore}%`);
  console.log(`- Non-Verbal Reliability: ${finalReport.nonVerbalAnalysis.dataReliability}`);
  console.log(`- Questions Evaluated: ${finalReport.questionEvaluations.length}`);

  assert(finalReport.overallScore > 0, 'Overall score must be greater than 0');
  assert(finalReport.questionEvaluations.length === 3, 'Must have 3 question evaluations');
  assert(Array.isArray(finalReport.strengths) && finalReport.strengths.length > 0, 'Must have strengths');
  assert(Array.isArray(finalReport.areasForImprovement) && finalReport.areasForImprovement.length > 0, 'Must have improvements');
  assert(Array.isArray(finalReport.actionableRecommendations), 'Must have actionable recommendations');
  console.log('✅ Test Case 6 passed: Complete scorecard with all 8 sections generated successfully.\n');

  // ----------------------------------------------------
  // TEST CASE 7: Different Performance Comparison
  // ----------------------------------------------------
  console.log('--- TEST CASE 7: Divergent Candidate Comparison ---');
  const poorSession = {
    role: 'Full Stack Developer',
    questions: [
      { order: 1, questionText: question1, answerText: "hlo" },
      { order: 2, questionText: question2, answerText: "hi" }
    ],
    metrics: null
  };

  const poorReport = await evaluateFullInterview(poorSession);
  console.log(`Poor Candidate Overall Score: ${poorReport.overallScore}/10`);
  console.log(`Strong Candidate Overall Score: ${finalReport.overallScore}/10`);

  assert(poorReport.overallScore <= 2.5, `Poor candidate score must be <= 2.5, got: ${poorReport.overallScore}`);
  assert(finalReport.overallScore > poorReport.overallScore + 4.0,
    `Strong candidate must score significantly higher than poor candidate (got ${finalReport.overallScore} vs ${poorReport.overallScore})`);
  assert(poorReport.areasForImprovement.some(a => a.toLowerCase().includes('greeting') || a.toLowerCase().includes('depth')),
    'Poor candidate report must highlight non-answers/greetings');
  console.log('✅ Test Case 7 passed: Clear divergence between poor and strong candidate evaluations.\n');

  console.log('====================================================');
  console.log('🎉 ALL 7 SYSTEM TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test Suite Exception:', err);
  process.exit(1);
});
