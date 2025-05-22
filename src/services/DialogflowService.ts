
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
      
      // In a production environment, this should be an actual API call to Dialogflow
      // However, to make this work without backend setup, we'll simulate the response
      // In a real implementation, you'd need to use a backend service or proxy to handle authentication
      
      // Here's how the actual API call would look like with a proper backend setup:
      /*
      const response = await fetch(
        `${this.baseUrl}/${this.projectId}/agent/sessions/${sessionId}:detectIntent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}` 
          },
          body: JSON.stringify({
            queryInput: {
              text: {
                text: message,
                languageCode: 'en-US'
              }
            }
          })
        }
      );
      
      const data = await response.json();
      return data.queryResult.fulfillmentText;
      */
      
      // For now, let's return a simulated response
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
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return responseText;
    } catch (error) {
      console.error('Error communicating with Dialogflow:', error);
      return "Sorry, I encountered an error while processing your request. Please try again.";
    }
  }
}
