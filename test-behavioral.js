// test-behavioral.js - Verification script for AI Behavioral Analysis Pipeline
const {
  BEHAVIORAL_ANALYSIS_SYSTEM_PROMPT,
  BEHAVIORAL_EVALUATION_SCHEMA,
  buildBehavioralUserPrompt
} = require('./Backend/prompts/behavioralPrompt');

const {
  analyzeBehavior,
  fallbackBehavioralAnalysis
} = require('./Backend/services/qwenService');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('--- 🧪 Testing AI Behavioral Analysis Pipeline ---');

// Test 1: Check Prompt and Schema definitions
console.log('1. Checking prompt and schema definitions...');
assert(typeof BEHAVIORAL_ANALYSIS_SYSTEM_PROMPT === 'string', 'System prompt must be a string');
assert(BEHAVIORAL_ANALYSIS_SYSTEM_PROMPT.includes('Confidence Analysis'), 'System prompt must include Confidence Analysis');
assert(BEHAVIORAL_ANALYSIS_SYSTEM_PROMPT.includes('Fear Analysis'), 'System prompt must include Fear Analysis');
assert(BEHAVIORAL_ANALYSIS_SYSTEM_PROMPT.includes('Anxiety Analysis'), 'System prompt must include Anxiety Analysis');
assert(Array.isArray(BEHAVIORAL_EVALUATION_SCHEMA.required), 'Schema must specify required fields');
console.log('✅ System prompt and JSON schema verified.');

// Test 2: Check Prompt formatting
console.log('\n2. Testing user prompt builder...');
const sampleTranscript = 'In our React application, we utilized custom hooks and Context API for global state management.';
const sampleMetrics = {
  eye_contact_pct: 85.0,
  face_detection_pct: 95.0,
  head_stability_pct: 90.0
};
const formattedPrompt = buildBehavioralUserPrompt(sampleTranscript, sampleMetrics);
assert(formattedPrompt.includes(sampleTranscript), 'User prompt must contain transcript');
assert(formattedPrompt.includes('85'), 'User prompt must contain eye_contact_pct');
console.log('✅ User prompt builder correctly merges verbal & non-verbal telemetry.');

// Test 3: Test fallback evaluation with confident candidate metrics
console.log('\n3. Testing behavioral evaluation for confident profile...');
const confidentResult = fallbackBehavioralAnalysis(sampleTranscript, sampleMetrics);
console.log('Confident Result:', JSON.stringify(confidentResult, null, 2));
assert(confidentResult.confidence_score >= 7, 'Confident profile should have confidence >= 7');
assert(confidentResult.anxiety_level === 'Low', 'Confident profile anxiety should be Low');
assert(Array.isArray(confidentResult.fear_indicators_detected), 'fear_indicators_detected must be an array');
assert(confidentResult.fear_indicators_detected.length === 0, 'No fear indicators should be detected for confident profile');
assert(typeof confidentResult.behavioral_analysis === 'string', 'behavioral_analysis must be a string');
assert(Array.isArray(confidentResult.actionable_advice), 'actionable_advice must be an array');
console.log('✅ Confident profile evaluation passed.');

// Test 4: Test fallback evaluation with anxious profile metrics
console.log('\n4. Testing behavioral evaluation for anxious/hesitant profile...');
const anxiousMetrics = {
  eye_contact_pct: 35.0,
  face_detection_pct: 80.0,
  head_stability_pct: 45.0,
  excessive_head_movement: true,
  frequent_eyebrow_movements: true,
  lip_tightening: true,
  frequent_pauses: true
};
const anxiousResult = fallbackBehavioralAnalysis('Um... we used... like... state... um...', anxiousMetrics);
console.log('Anxious Result:', JSON.stringify(anxiousResult, null, 2));
assert(anxiousResult.anxiety_level === 'High' || anxiousResult.anxiety_level === 'Medium', 'Anxious profile should be Medium or High');
assert(anxiousResult.confidence_score <= 6, 'Anxious profile should have lower confidence score');
assert(anxiousResult.fear_indicators_detected.length > 0, 'Should detect looking away or fear-related indicator');
console.log('✅ Anxious profile evaluation passed.');

// Test 5: Missing or unavailable MediaPipe data (Should be inconclusive without penalizing candidate)
console.log('\n5. Testing missing/unreliable MediaPipe telemetry handling...');
const missingDataResult = fallbackBehavioralAnalysis(sampleTranscript, null);
console.log('Missing Data Result:', JSON.stringify(missingDataResult, null, 2));
assert(missingDataResult.behavioral_analysis.toLowerCase().includes('inconclusive'), 'Missing telemetry must explicitly note inconclusive assessment');
assert(missingDataResult.fear_indicators_detected.length === 0, 'Must NOT invent fear indicators when data is missing');
assert(missingDataResult.confidence_score >= 5, 'Must not penalize candidate when sensor data is missing');
console.log('✅ Missing telemetry handled gracefully with inconclusive status.');

console.log('\n🎉 ALL 5 BEHAVIORAL ANALYSIS TESTS COMPLETED SUCCESSFULLY!');
