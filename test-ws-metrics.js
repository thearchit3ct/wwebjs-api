const WebSocket = require('ws');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtZHNzaDM4bDAwMDB4aml0bm90cnp3YmQiLCJlbWFpbCI6ImFkbWluQHd3ZWJqcy5jb20iLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJzZXNzaW9uSWQiOiJjbWR1YTlzdDAwMDBkeGo4cnBvazBoNnJzIiwiaWF0IjoxNzU0MTQxMDE5LCJleHAiOjE3NTQxNjk4MTl9.3mzOfDwjOTZfAMqkVWfOGcx1TpEzy-Y0Q8hlb01xJzQ';

const ws = new WebSocket(`ws://95.216.147.29:3050/api/admin/websocket?token=${token}`);

ws.on('open', () => {
  console.log('WebSocket connected!');
  
  // Subscribe to dashboard updates
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'dashboard' }));
  console.log('Subscribed to dashboard channel');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === 'system:metrics') {
    console.log('\n=== System Metrics Update ===');
    console.log('CPU Usage:', message.data.cpu.usage + '%');
    console.log('Memory Usage:', (message.data.memory.usage).toFixed(2) + '%');
    console.log('Uptime:', Math.floor(message.data.uptime / 60) + ' minutes');
    console.log('Timestamp:', new Date(message.data.timestamp).toLocaleString());
  } else {
    console.log('Received:', message.type, message.data);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed:', code, reason.toString());
});

// Keep the script running
console.log('Listening for metrics updates... Press Ctrl+C to exit');