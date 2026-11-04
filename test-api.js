const http = require('http');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const app = require('./app');
const User = require('./Backend/models/User');

async function runTest() {
  console.log('--- Starting API Diagnostics & Test ---');

  // 1. Ensure a test user exists with valid bcrypt password
  const testEmail = 'autotest_candidate@example.com';
  let testUser = await User.findByEmail(testEmail);
  const hashedPassword = await bcrypt.hash('secret123', 12);

  if (!testUser) {
    testUser = await User.create({
      firstName: 'Auto',
      lastName: 'Tester',
      email: testEmail,
      password: hashedPassword,
      role: 'candidate',
      targetRole: 'Full Stack Developer',
      experienceLevel: 'Fresher'
    });
    console.log('Created test candidate user with ID:', testUser.id);
  } else {
    testUser.password = hashedPassword;
    await testUser.save();
    console.log('Updated existing test candidate with ID:', testUser.id);
  }

  // 2. Start server on an ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(3999, resolve));
  console.log('Test server listening on port 3999');

  try {
    // 3. Perform login to get session cookie
    console.log('\n1. Testing Login to acquire session...');
    const loginRes = await fetch('http://127.0.0.1:3999/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: testEmail,
        password: 'secret123'
      })
    });

    const cookie = loginRes.headers.get('set-cookie');
    console.log('Login status:', loginRes.status);
    console.log('Session Cookie:', cookie ? 'Acquired: ' + cookie.split(';')[0] : 'Missing');

    // 4. Test /api/interviews/start
    console.log('\n2. Testing POST /api/interviews/start...');
    const startRes = await fetch('http://127.0.0.1:3999/api/interviews/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': cookie || ''
      },
      body: JSON.stringify({
        role: 'Full Stack Developer',
        difficulty: 'Medium',
        experienceLevel: 'Fresher'
      })
    });

    console.log('Start Status:', startRes.status);
    const startData = await startRes.json();
    console.log('Start Response:', startData);

    const interviewId = startData.interviewId;
    if (!interviewId) {
      throw new Error('No interviewId returned from /start');
    }

    // 5. Test POST /api/interviews/:id/questions/generate
    console.log(`\n3. Testing POST /api/interviews/${interviewId}/questions/generate...`);
    const genRes = await fetch(`http://127.0.0.1:3999/api/interviews/${interviewId}/questions/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': cookie || ''
      },
      body: JSON.stringify({
        targetRole: 'Full Stack Developer',
        experienceLevel: 'Fresher'
      })
    });

    console.log('Generate Status:', genRes.status);
    const genData = await genRes.json();
    console.log('Generate Response:', genData);

    const questionId = genData.questionId;
    if (!questionId) {
      throw new Error('No questionId returned from /generate');
    }

    // 6. Test POST /api/interviews/questions/:id/evaluate
    console.log(`\n4. Testing POST /api/interviews/questions/${questionId}/evaluate...`);
    const evalRes = await fetch(`http://127.0.0.1:3999/api/interviews/questions/${questionId}/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': cookie || ''
      },
      body: JSON.stringify({
        questionText: genData.question,
        answerText: 'In a web request lifecycle, the browser parses the URL, performs DNS resolution, initiates a TCP 3-way handshake and TLS handshake, and transmits an HTTP GET request to the reverse proxy. The reverse proxy terminates TLS and forwards the request to an Express application server which validates sessions, queries MySQL, and returns JSON.'
      })
    });

    console.log('Evaluate Status:', evalRes.status);
    const evalData = await evalRes.json();
    console.log('Evaluate Response:', evalData);

    if ((genRes.status === 200 || genRes.status === 201) && evalRes.status === 200) {
      console.log('\n🎉 ALL TESTS PASSED! Start, Generate, and Evaluate all succeeded!');
    } else {
      console.error('\n❌ Test failed with statuses:', genRes.status, evalRes.status);
    }
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTest();
