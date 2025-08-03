const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api/admin';

async function testAdminEndpoints() {
  console.log('🧪 Testing Admin API Endpoints\n');

  // Test 1: Health Check
  try {
    console.log('1. Testing Health Check...');
    const health = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Health Check:', health.data);
  } catch (error) {
    console.log('❌ Health Check failed:', error.message);
  }

  // Test 2: Login without credentials
  try {
    console.log('\n2. Testing Login (should fail without credentials)...');
    await axios.post(`${API_BASE_URL}/auth/login`, {});
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Login validation working correctly');
    } else {
      console.log('❌ Login test failed:', error.message);
    }
  }

  // Test 3: Protected route without auth
  try {
    console.log('\n3. Testing Protected Route without auth (should fail)...');
    await axios.get(`${API_BASE_URL}/users`);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Authentication middleware working correctly');
    } else {
      console.log('❌ Protected route test failed:', error.message);
    }
  }

  // Test 4: Metrics endpoint
  try {
    console.log('\n4. Testing Metrics Endpoint...');
    const metrics = await axios.get('http://localhost:3000/metrics');
    console.log('✅ Metrics endpoint working');
    console.log('Sample metrics:', metrics.data.substring(0, 200) + '...');
  } catch (error) {
    console.log('❌ Metrics test failed:', error.message);
  }

  console.log('\n✨ Admin API testing completed!');
}

testAdminEndpoints().catch(console.error);