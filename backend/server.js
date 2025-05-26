
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const dialogflow = require('@google-cloud/dialogflow');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration to allow requests from your frontend
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Dialogflow API endpoint
app.post('/api/dialogflow', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log(`Processing message: ${message} for session: ${sessionId}`);

    // Create a new session client with explicit credentials
    const sessionClient = new dialogflow.SessionsClient({
      keyFilename: './google-credentials.json',
      projectId: 'executiveassistant-thyy'
    });
    
    const sessionPath = sessionClient.projectAgentSessionPath(
      'executiveassistant-thyy',
      sessionId
    );

    // The text query request
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message,
          languageCode: 'en-US',
        },
      },
    };

    console.log('Sending request to Dialogflow:', request);

    // Send request to Dialogflow
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    
    console.log('Dialogflow response:', result);
    
    // Return the response to the client
    return res.status(200).json({
      responseText: result.fulfillmentText,
      isFinal: true,
      intentDetected: result.intent ? result.intent.displayName : null,
      confidence: result.intentDetectionConfidence,
      parameters: result.parameters,
    });
  } catch (error) {
    console.error('Error processing Dialogflow request:', error);
    return res.status(500).json({ 
      error: 'Failed to process request',
      message: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using Dialogflow project: executiveassistant-thyy`);
});
