require('dotenv').config();
const express = require('express');
const cors = require('cors');
const dialogflow = require('@google-cloud/dialogflow');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for all requests
app.use(cors());

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

// Endpoint to fetch calendar events
app.get('/api/calendar/events', async (req, res) => {
  try {
    const calendarId = "b057ed268c5ea861a1a57fa9fc1f4df34043368d5bbf78ae627b8850d9cc8c71@group.calendar.google.com";
    const serviceAccount = {
      "type": "service_account",
      "project_id": "executiveassistant-thyy",
      "private_key_id": "ee7964373dc68b3918df516e69d2322c35d5560a",
      "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDbLIihGG35pKRu\npgPHKcsGLoe/kJnNUyPHM8SACIpcZOw8ItNb3uWG6hSW4uiDqZrOjnQbiHXEwdd9\nKdwgVrBZ4Twg2alNbhhQXHWWNM1BN+96xTD5B1PedFJUvhggMgYBRGZW2ikB4ual\nJ6HEWsXNEVAziTyHRoBet2DaD24gLvmPOF78K15BeusTuOke6on6CLtOGKQGQPZD\nm8PWl21AhcWUMW3JZBVfGJRUjc2MZvVhtJUJpmZDVWMgyPqcYbOvhX8uB1i97uQo\n1psNvL45bprlzWbZ/EnlQea/T2o/u9BR0QnmyAMEs351t9e5cg0Nv90TAw73Fwpm\n7Pd1uSaXAgMBAAECggEAX7pxSK+DZUzQlxWCw+wQpXgQSY7uZlxgXaLSOjvAtv9L\noS5y04clCErYSFj+Rnd/SqW0t8vf6Frj9GKipytF5lP2r8Bx7oReMUdZAoy4c7pr\nKlvTeomFS73Rsfq/Tdybe9U0v82UqKLCq7MGOF2PVHSx63iPC+Syr+v3bPbdWkdr\nPXvwjJOlOM6GQ6pin8zK/cR9ipcVCje8+uwfhheWS6LJAKNbapTY2H71qg8TaIin\nQjmQ4q2+0Y3JBNzuMdG++J9uncnplfbsiMEkv4LnVM1fbau8S7uLm95TGEKNa5SG\nCKlPgYsMarAwz61kN1dxDv2dp+vgCeOITEiMfi+JFQKBgQDwvIxpCZ6wU4g2FAnU\n5uZ33cp8iao517feZ99QHXLJKFNXBI9591naVmuXSDRtj0c2fV4uCpabuqibPO9V\n/kCBcrXEp55yjbi7Qzs57KKoUMfK8F6Z0KcLmT3jj2cnTvfqLCBH9q0B5DEw/PkK\ndmBTxZtvyFfMje69dud12Vj6KwKBgQDpEf+MwC7fv8H7mcODFFLWR00ep8Vn67+P\npixbTkuk5JjvbnZ91ds/RkL7Ju5isE3hykYI8gsdILvj2IKp4hPdD9hOwnyZHYUR\nON9t++n3k1EDCv+Sgt7dmOp+KZU+LUyOs5wo0clzM8bMzw06MeDt9X6w89nL9Aeb\nN1r3gmmrRQKBgDUmG4XRJuTc/FScJfOIKtfJ8rt+FUQB+Ukz+5yPc9kvev7aNecC\nkibfL4/N1C1gFaPVF+boVYn6MuFbGagNoyYxMipBq3y1B1ToqfnG4b5xXzrRyMEC\nzO6FnaFQ9sA58ggUR+g7cMTbIXUkVMNXkTrNhNywCZpSt6PCzaU6ICfTAoGBAKIl\njV5EjdfINpJt5SEaUI8Wx8Zd/e5QitLLTuyuyd2L1AIvHWxqDcA1h3/nE83Azk4Z\nRSQQED9ReKYJCM5bpGoVDe2tTLXRXbQflwGTUrCU4rV1P1yUg6wzKGBhWZ0KMsrM\nlgWn/biR+uqd2Zv0+4FRW7SL0agcu/X2SukK56zpAoGBAK1LdzPQF1lW5tt3DWfT\np9S4QCXuHdBasjRhHSf5Q6mbkJGwEvSPTn0hjb+cqoxBbYMoSQ+Cqa5Gtw7/W9bv\nAKleYhuurZaEK6oSiuwVLfDr82V8tVu7DQFzU5bX0TQbvKXawqecv1Nvmznt0X3n\n9VC92pEG1bzmOmD93YtlHpe0\n-----END PRIVATE KEY-----\n",
      "client_email": "executiveassistantbot@executiveassistant-thyy.iam.gserviceaccount.com",
      "client_id": "114783251868593567392",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/executiveassistantbot%40executiveassistant-thyy.iam.gserviceaccount.com",
      "universe_domain": "googleapis.com"
    };

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
      calendarId,
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    console.log('Google Calendar API response:', response.data); // Log the full response

    const events = response.data.items;
    res.status(200).json({ events });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events', message: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using Dialogflow project: executiveassistant-thyy`);
});
