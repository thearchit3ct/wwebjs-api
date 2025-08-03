# WWebJS API Endpoints

## Base URL
- Local: `http://localhost:3050`
- Production: `http://YOUR_SERVER:3050`

## Authentication
Toutes les requêtes nécessitent un header `x-api-key`:
```
x-api-key: SET_YOUR_API_KEY_HERE
```

## Health Check
```bash
GET /ping
```

## Session Management

### List all sessions
```bash
GET /session/getSessions
```

### Start a session
```bash
GET /session/start/{sessionId}
```

### Stop a session
```bash
GET /session/stop/{sessionId}
```

### Get session status
```bash
GET /session/status/{sessionId}
```

### Get QR code
```bash
GET /session/qr/{sessionId}
GET /session/qr/{sessionId}/image
```

### Request pairing code
```bash
POST /session/requestPairingCode/{sessionId}
```

### Restart session
```bash
GET /session/restart/{sessionId}
```

### Terminate session
```bash
GET /session/terminate/{sessionId}
```

## Client Operations

### Get info
```bash
GET /client/getClassInfo/{sessionId}
```

### Accept invite
```bash
POST /client/acceptInvite/{sessionId}
Body: { "inviteCode": "invite_code_here" }
```

### Archive/Unarchive chat
```bash
POST /client/archiveChat/{sessionId}
Body: { "chatId": "chat_id_here" }

POST /client/unarchiveChat/{sessionId}
Body: { "chatId": "chat_id_here" }
```

## Chat Operations

### Send message
```bash
POST /client/sendMessage/{sessionId}
Body: {
  "chatId": "phone@c.us",
  "contentType": "string",
  "content": "Hello World"
}
```

### Get chats
```bash
GET /client/getChats/{sessionId}
```

### Get chat by ID
```bash
GET /client/getChatById/{sessionId}
Body: { "chatId": "chat_id_here" }
```

### Get messages
```bash
GET /client/getChatMessages/{sessionId}?chatId=phone@c.us&limit=50
```

## Message Operations

### Send text message
```bash
POST /message/sendText/{sessionId}
Body: {
  "chatId": "phone@c.us",
  "text": "Hello World",
  "mentions": []
}
```

### Send media
```bash
POST /message/sendMedia/{sessionId}
Body: {
  "chatId": "phone@c.us",
  "file": {
    "mimetype": "image/jpeg",
    "data": "base64_encoded_data",
    "filename": "image.jpg"
  },
  "caption": "Check this out!"
}
```

### Send location
```bash
POST /message/sendLocation/{sessionId}
Body: {
  "chatId": "phone@c.us",
  "latitude": "-23.533773",
  "longitude": "-46.625290",
  "description": "My location"
}
```

### React to message
```bash
POST /message/sendReaction/{sessionId}
Body: {
  "messageId": "message_id_here",
  "reaction": "👍"
}
```

## Contact Operations

### Get contacts
```bash
GET /contact/getContacts/{sessionId}
```

### Get contact by ID
```bash
GET /contact/getContactById/{sessionId}
Body: { "contactId": "phone@c.us" }
```

### Block/Unblock contact
```bash
POST /contact/block/{sessionId}
Body: { "contactId": "phone@c.us" }

POST /contact/unblock/{sessionId}
Body: { "contactId": "phone@c.us" }
```

## Group Operations

### Create group
```bash
POST /groupChat/create/{sessionId}
Body: {
  "name": "My Group",
  "participants": ["phone1@c.us", "phone2@c.us"]
}
```

### Add/Remove participants
```bash
POST /groupChat/addParticipants/{sessionId}
Body: {
  "chatId": "group_id@g.us",
  "participantIds": ["phone@c.us"]
}

POST /groupChat/removeParticipants/{sessionId}
Body: {
  "chatId": "group_id@g.us",
  "participantIds": ["phone@c.us"]
}
```

### Promote/Demote admins
```bash
POST /groupChat/promoteParticipants/{sessionId}
Body: {
  "chatId": "group_id@g.us",
  "participantIds": ["phone@c.us"]
}

POST /groupChat/demoteParticipants/{sessionId}
Body: {
  "chatId": "group_id@g.us",
  "participantIds": ["phone@c.us"]
}
```

## Example Usage

### Start a session and get QR code
```bash
# 1. Start session
curl -X GET 'http://localhost:3050/session/start/my-session' \
  -H 'x-api-key: SET_YOUR_API_KEY_HERE'

# 2. Get QR code
curl -X GET 'http://localhost:3050/session/qr/my-session' \
  -H 'x-api-key: SET_YOUR_API_KEY_HERE'

# 3. Check status
curl -X GET 'http://localhost:3050/session/status/my-session' \
  -H 'x-api-key: SET_YOUR_API_KEY_HERE'
```

### Send a message
```bash
curl -X POST 'http://localhost:3050/message/sendText/my-session' \
  -H 'x-api-key: SET_YOUR_API_KEY_HERE' \
  -H 'Content-Type: application/json' \
  -d '{
    "chatId": "5511999999999@c.us",
    "text": "Hello from WWebJS API!"
  }'
```

## Error Responses

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Success Responses

```json
{
  "success": true,
  "result": {
    // Response data
  }
}
```