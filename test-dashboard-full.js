const axios = require('axios');

async function testFullDashboardFlow() {
  try {
    console.log('=== Testing Full Dashboard Flow ===\n');

    // Step 1: Login to get fresh token
    console.log('1. Logging in...');
    const loginResponse = await axios.post('http://95.216.147.29:3050/api/admin/auth/login', {
      email: 'admin@wwebjs.com',
      password: 'admin123'
    });

    const token = loginResponse.data.data.accessToken;
    console.log('✅ Login successful, got token');

    // Step 2: Create API client like dashboard does
    const api = axios.create({
      baseURL: 'http://95.216.147.29:3050/api/admin',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });

    // Step 3: Test dashboard service getOverview logic
    console.log('\n2. Fetching dashboard data...');
    
    const [systemHealthResponse, systemStatusResponse, sessionsResponse] = await Promise.all([
      api.get('/system/health'),
      api.get('/system/status'),
      api.get('/sessions')
    ]);

    console.log('✅ All API calls successful');

    const healthData = systemHealthResponse.data;
    const statusData = systemStatusResponse.data.data;
    const sessionsData = sessionsResponse.data.data;

    // Calculate uptime string
    const uptimeSeconds = statusData.application.uptime;
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptimeString = `${days} days, ${hours} hours`;

    // Map real API data to dashboard interface (same as dashboardService)
    const dashboardOverview = {
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
      },
      sessions: sessionsData.map((session) => ({
        id: session.id,
        name: session.sessionId,
        phone: session.runtimeStatus?.phoneNumber || 'Unknown',
        status: session.runtimeStatus?.connected ? 'connected' : 'disconnected',
        lastSeen: session.updatedAt || session.createdAt,
        messagesHandled: 0,
      })),
      messageFlow: {
        timestamps: [],
        sent: [],
        received: [],
      },
      alerts: healthData.status !== 'healthy' ? [{
        id: 'system-health',
        severity: healthData.status === 'critical' ? 'error' : 'warning',
        message: `System health is ${healthData.status}`,
        timestamp: new Date().toISOString(),
      }] : [],
      recentActivity: [],
    };

    console.log('\n=== Final Dashboard Data (What should be displayed) ===');
    console.log('📊 STATS:');
    console.log('  Total Sessions:', dashboardOverview.stats.totalSessions);
    console.log('  Active Sessions:', dashboardOverview.stats.activeSessions);
    console.log('  Messages Handled:', dashboardOverview.stats.messagesHandled);
    console.log('  System Uptime:', dashboardOverview.stats.systemUptime);
    
    console.log('\n💚 HEALTH:');
    console.log('  CPU:', dashboardOverview.health.cpu.toFixed(1) + '%');
    console.log('  Memory:', dashboardOverview.health.memory + '%');
    console.log('  Disk:', dashboardOverview.health.disk.toFixed(2) + '%');
    console.log('  Status:', dashboardOverview.health.status);
    
    console.log('\n📱 SESSIONS:', dashboardOverview.sessions.length, 'sessions');
    console.log('\n🚨 ALERTS:', dashboardOverview.alerts.length, 'alerts');

    if (dashboardOverview.stats.totalSessions > 0 || 
        dashboardOverview.health.memory > 0 || 
        dashboardOverview.health.disk > 0) {
      console.log('\n✅ SUCCESS: Dashboard should display REAL DATA!');
    } else {
      console.log('\n❌ PROBLEM: Dashboard data is still empty/zero');
    }

  } catch (error) {
    console.error('\n❌ ERROR in dashboard flow:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testFullDashboardFlow();