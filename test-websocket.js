const WebSocket = require('ws');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtZHNzaDM4bDAwMDB4aml0bm90cnp3YmQiLCJlbWFpbCI6ImFkbWluQHd3ZWJqcy5jb20iLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJzZXNzaW9uSWQiOiJjbWR1YTlzdDAwMDBkeGo4cnBvazBoNnJzIiwiaWF0IjoxNzU0MTQxMDE5LCJleHAiOjE3NTQxNjk4MTl9.3mzOfDwjOTZfAMqkVWfOGcx1TpEzy-Y0Q8hlb01xJzQ';

const ws = new WebSocket(`ws://95.216.147.29:3050/api/admin/websocket?token=${token}`);

ws.on('open', () => {
  console.log('WebSocket connected!');
  
  // Send a ping
  ws.send(JSON.stringify({ type: 'ping' }));
  
  // Subscribe to dashboard updates
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'dashboard' }));
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed:', code, reason.toString());
});

// Keep the script running
setTimeout(() => {
  console.log('Closing connection...');
  ws.close();
  process.exit(0);
}, 10000);