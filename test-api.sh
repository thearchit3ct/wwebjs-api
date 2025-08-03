#!/bin/bash

# Configuration
API_URL="${1:-http://localhost:3050}"
API_KEY="${2:-SET_YOUR_API_KEY_HERE}"
SESSION_ID="${3:-test-session}"

echo "🔧 Testing WWebJS API at $API_URL"
echo "📝 Using session ID: $SESSION_ID"
echo ""

# Test 1: Ping
echo "1️⃣ Testing /ping endpoint..."
curl -s "$API_URL/ping" | jq .
echo ""

# Test 2: Get all sessions
echo "2️⃣ Getting all sessions..."
curl -s -X GET "$API_URL/session/getSessions" \
  -H "x-api-key: $API_KEY" | jq .
echo ""

# Test 3: Check session status
echo "3️⃣ Checking session status..."
curl -s -X GET "$API_URL/session/status/$SESSION_ID" \
  -H "x-api-key: $API_KEY" | jq .
echo ""

# Test 4: Start session (if not exists)
echo "4️⃣ Starting session (this may take time)..."
echo "   Press Ctrl+C to skip if it hangs"
timeout 10 curl -s -X GET "$API_URL/session/start/$SESSION_ID" \
  -H "x-api-key: $API_KEY" | jq .
echo ""

# Test 5: Get QR code
echo "5️⃣ Getting QR code..."
curl -s -X GET "$API_URL/session/qr/$SESSION_ID" \
  -H "x-api-key: $API_KEY" | jq .
echo ""

echo "✅ API tests completed!"