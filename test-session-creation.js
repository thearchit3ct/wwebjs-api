const axios = require('axios');

// Configuration
const ADMIN_API_URL = 'http://localhost:3050/api/admin';
const ADMIN_EMAIL = 'admin@wwebjs.com';
const ADMIN_PASSWORD = 'admin123';

async function testSessionCreation() {
  try {
    console.log('1. Logging in to admin API...');
    const loginResponse = await axios.post(`${ADMIN_API_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const { accessToken } = loginResponse.data.data;
    console.log('✓ Login successful');

    // Configure axios with auth token
    const api = axios.create({
      baseURL: ADMIN_API_URL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('\n2. Fetching users...');
    const usersResponse = await api.get('/users');
    const users = usersResponse.data.data;
    console.log(`✓ Found ${users.length} users`);

    if (users.length === 0) {
      console.log('\n3. Creating a test user...');
      const createUserResponse = await api.post('/users', {
        email: 'test@example.com',
        name: 'Test User',
        password: 'test123',
      });
      console.log('✓ Test user created');
      users.push(createUserResponse.data.data);
    }

    const testUser = users[0];
    console.log(`\n3. Using user: ${testUser.name} (${testUser.email})`);

    console.log('\n4. Creating a new session...');
    const sessionId = `test-session-${Date.now()}`;
    const createSessionResponse = await api.post('/sessions', {
      sessionId: sessionId,
      userId: testUser.id,
      webhookUrl: 'https://example.com/webhook',
    });

    console.log('✓ Session created:', createSessionResponse.data);
    const session = createSessionResponse.data.data;

    console.log('\n5. Checking session status...');
    const statusResponse = await api.get(`/sessions/${session.id}/wwebjs-status`);
    console.log('✓ Session status:', statusResponse.data);

    console.log('\n6. Getting QR code...');
    try {
      const qrResponse = await api.get(`/sessions/${session.id}/qr`);
      console.log('✓ QR code available:', qrResponse.data);
    } catch (error) {
      console.log('✗ QR code not available:', error.response?.data?.error?.message || error.message);
    }

    console.log('\n7. Starting session in WWebJS...');
    try {
      const startResponse = await api.post(`/sessions/${session.id}/start`);
      console.log('✓ Session started:', startResponse.data);
    } catch (error) {
      console.log('✗ Failed to start session:', error.response?.data?.error?.message || error.message);
    }

    console.log('\n8. Listing all sessions...');
    const sessionsResponse = await api.get('/sessions');
    console.log(`✓ Total sessions: ${sessionsResponse.data.data.length}`);
    console.log('Sessions:', sessionsResponse.data.data.map(s => ({
      id: s.sessionId,
      status: s.status,
      connected: s.runtimeStatus?.connected || false,
    })));

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    console.error('Full error:', error);
  }
}

// Run the test
testSessionCreation();