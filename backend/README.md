
# Dialogflow Proxy Server

This is a backend proxy server for securely communicating with Google's Dialogflow API. It handles authentication and provides an API endpoint for your frontend application.

## Setup Instructions

### 1. Install Dependencies
```
cd backend
npm install
```

### 2. Set Up Google Cloud Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (executiveassistant-thyy)
3. Go to "IAM & Admin" > "Service Accounts"
4. Create a new service account or use an existing one
5. Generate a JSON key file
6. Download the JSON key file and save it as `google-credentials.json` in the backend directory

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env`
2. Update the values if needed:
   - `DIALOGFLOW_PROJECT_ID` should be set to your Dialogflow project ID
   - `CLIENT_ORIGIN` should be set to your frontend application URL

### 4. Start the Server

Development mode (with auto-restart):
```
npm run dev
```

Production mode:
```
npm start
```

## API Endpoints

### POST /api/dialogflow
Sends a message to Dialogflow and returns the response.

**Request Body:**
```json
{
  "message": "Hello, how are you?",
  "sessionId": "unique-session-id",
  "projectId": "executiveassistant-thyy"
}
```

**Response Body:**
```json
{
  "responseText": "I'm doing well, thank you for asking!",
  "isFinal": true,
  "intentDetected": "Greeting",
  "confidence": 0.92,
  "parameters": {}
}
```

### GET /health
Health check endpoint to verify the server is running.

**Response:**
```json
{
  "status": "ok",
  "message": "Server is running"
}
```
