const axios = require('axios');

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtZHNzaDM4bDAwMDB4aml0bm90cnp3YmQiLCJlbWFpbCI6ImFkbWluQHd3ZWJqcy5jb20iLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJzZXNzaW9uSWQiOiJjbWRzeGpxbGowMDA1eGozMXpiNmVsN2tlIiwiaWF0IjoxNzU0MDU5MTgxLCJleHAiOjE3NTQwODc5ODF9.8DlRCYqji9RyLi31r16vwgqAUmmWRqzyIsw8eFHS-Tg";

const api = axios.create({
  baseURL: 'http://95.216.147.29:3050/api/admin',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
});

async function testDashboardAPI() {
  try {
    console.log('Testing dashboard API calls...\n');

    // Test the exact same calls as dashboardService
    const [systemHealthResponse, systemStatusResponse, sessionsResponse] = await Promise.all([
      api.get('/system/health'),
      api.get('/system/status'),
      api.get('/sessions')
    ]);

    console.log('=== API Responses ===');
    console.log('Health status:', systemHealthResponse.data.status);
    console.log('Status data keys:', Object.keys(systemStatusResponse.data.data));
    console.log('Sessions count:', sessionsResponse.data.data.length);

    const healthData = systemHealthResponse.data;
    const statusData = systemStatusResponse.data.data;
    const sessionsData = sessionsResponse.data.data;

    // Mimic dashboard parsing
    const uptimeSeconds = statusData.application.uptime;
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptimeString = `${days} days, ${hours} hours`;

    const dashboardData = {
      stats: {
        totalSessions: statusData.services.whatsapp.sessions || 0,
        activeSessions: statusData.services.whatsapp.connected || 0,
        messagesHandled: 0,
        systemUptime: uptimeString,
      },
      health: {
        cpu: statusData.system.loadAverage[0] * 10 || 0,
        memory: parseFloat(statusData.system.memory.percentage) || 0,
        disk: healthData.checks.disk?.details ? 
          ((healthData.checks.disk.details.used / healthData.checks.disk.details.total) * 100) : 0,
        status: healthData.status === 'healthy' ? 'healthy' : 
               healthData.status === 'critical' ? 'critical' : 'warning',
      }
    };

    console.log('\n=== Parsed Dashboard Data ===');
    console.log('Total Sessions:', dashboardData.stats.totalSessions);
    console.log('Active Sessions:', dashboardData.stats.activeSessions);
    console.log('System Uptime:', dashboardData.stats.systemUptime);
    console.log('CPU:', dashboardData.health.cpu + '%');
    console.log('Memory:', dashboardData.health.memory + '%');
    console.log('Disk:', dashboardData.health.disk.toFixed(2) + '%');
    console.log('Health Status:', dashboardData.health.status);

  } catch (error) {
    console.error('Error testing dashboard API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testDashboardAPI();