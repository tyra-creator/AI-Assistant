
import { APIService } from './APIService';

interface DialogflowResponse {
  responseText: string;
  isFinal: boolean;
  intentDetected?: string;
  confidence?: number;
  parameters?: any;
}

export class DialogflowService {
  /**
   * Sends a text message to Dialogflow via the backend API and returns the response
   */
  static async sendMessage(message: string): Promise<string> {
    try {
      console.log(`Sending message to Dialogflow API: ${message}`);
      
      // Get session ID from APIService
      const sessionId = APIService.getSessionId();
      
      const response = await APIService.post<DialogflowResponse>('/dialogflow', {
        message: message,
        sessionId: sessionId
      });
      
      console.log('Received response from Dialogflow:', response);
      
      return response.responseText || "I received your message but couldn't generate a response.";
      
    } catch (error) {
      console.error('Error communicating with Dialogflow:', error);
      return "Sorry, I encountered an error while processing your request. Please try again.";
    }
  }
}
