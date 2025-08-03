const axios = require('axios');

async function testAuthFlow() {
  console.log('=== Testing Real Authentication Flow ===\n');
  
  try {
    // Step 1: Test login endpoint
    console.log('1. Testing login endpoint...');
    
    const loginResponse = await axios.post('http://95.216.147.29:3050/api/admin/auth/login', {
      email: 'admin@wwebjs.com',
      password: 'admin123'
    });
    
    console.log('✅ Login successful!');
    console.log('Response:', {
      message: loginResponse.data.message,
      hasToken: !!loginResponse.data.data.accessToken,
      hasRefreshToken: !!loginResponse.data.data.refreshToken,
      expiresIn: loginResponse.data.data.expiresIn,
      admin: loginResponse.data.data.admin
    });
    
    const token = loginResponse.data.data.accessToken;
    console.log('\n🔑 Token received:', token.substring(0, 50) + '...');
    
    // Step 2: Test authenticated endpoints
    console.log('\n2. Testing authenticated endpoints...');
    
    const api = axios.create({
      baseURL: 'http://95.216.147.29:3050/api/admin',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // Test health
    console.log('\n  a) Testing /system/health...');
    const healthResponse = await api.get('/system/health');
    console.log('  ✅ Health:', healthResponse.data.status);
    console.log('  Memory:', healthResponse.data.checks.memory.message);
    console.log('  Disk:', healthResponse.data.checks.disk.message);
    
    // Test status
    console.log('\n  b) Testing /system/status...');
    const statusResponse = await api.get('/system/status');
    console.log('  ✅ Status received');
    console.log('  Uptime:', Math.floor(statusResponse.data.data.application.uptime / 60), 'minutes');
    console.log('  Memory:', statusResponse.data.data.system.memory.percentage + '%');
    
    // Test sessions
    console.log('\n  c) Testing /sessions...');
    const sessionsResponse = await api.get('/sessions');
    console.log('  ✅ Sessions:', sessionsResponse.data.data.length, 'sessions');
    
    console.log('\n✅ All authentication and API endpoints working correctly!');
    console.log('\n🎯 The dashboard should now work with real data.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testAuthFlow();