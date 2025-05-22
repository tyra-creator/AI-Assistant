
import { APIService } from './APIService';

interface DialogflowResponse {
  responseText: string;
  isFinal: boolean;
}

export class DialogflowService {
  private static projectId = 'executiveassistant-thyy';
  private static baseUrl = 'https://dialogflow.googleapis.com/v2/projects';
  
  /**
   * Sends a text message to Dialogflow and returns the response
   */
  static async sendMessage(message: string): Promise<string> {
    try {
      console.log(`Sending message to Dialogflow: ${message}`);
      
      // Check if we're in development mode (no backend available)
      if (import.meta.env.DEV && !import.meta.env.VITE_USE_BACKEND) {
        return this.getSimulatedResponse(message);
      }
      
      // In production, use the backend proxy
      try {
        const data = await APIService.post<DialogflowResponse>('/dialogflow', {
          message,
          sessionId: APIService.getSessionId(),
          projectId: this.projectId
        });
        
        return data.responseText;
      } catch (error) {
        console.error('Error communicating with Dialogflow:', error);
        return "Sorry, I encountered an error while processing your request. Please try again.";
      }
    } catch (error) {
      console.error('Error in DialogflowService:', error);
      return "Sorry, I encountered an error while processing your request. Please try again.";
    }
  }

  /**
   * Returns a simulated response for development mode
   * This allows testing without a backend
   */
  private static getSimulatedResponse(message: string): string {
    // Simulate network delay
    setTimeout(() => {}, 500);
    
    // Simulated responses for testing
    const simulatedResponses: Record<string, string> = {
      "hello": "Hello! I'm your Executive Assistant powered by Dialogflow. How can I help you today?",
      "hi": "Hi there! I'm your Executive Assistant powered by Dialogflow. How can I help you today?",
      "what can you do": "As your Executive Assistant, I can help you manage your schedule, check upcoming events, set reminders, and more. Just ask!",
      "what's my schedule": "Based on your calendar, you have a team meeting at 2:00 PM today and a project deadline tomorrow at 6:00 PM.",
      "what's my schedule for today": "Today you have a team meeting at 2:00 PM about weekly progress updates.",
      "help": "I can help you manage your schedule, check upcoming events, answer questions, and more. Try asking 'What's my schedule for today?' or 'Do I have any meetings tomorrow?'"
    };
    
    // Default response if no match is found
    let responseText = "I'm processing your request. In a full implementation, this would connect to the Dialogflow API with project ID: executiveassistant-thyy";
    
    // Check for whole message match
    if (simulatedResponses[message.toLowerCase()]) {
      responseText = simulatedResponses[message.toLowerCase()];
    } else {
      // Check for partial matches
      for (const key of Object.keys(simulatedResponses)) {
        if (message.toLowerCase().includes(key)) {
          responseText = simulatedResponses[key];
          break;
        }
      }
    }
    
    return responseText;
  }
}
