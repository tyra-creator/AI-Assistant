
interface DialogflowResponse {
  responseText: string;
  isFinal: boolean;
}

interface WebhookResponse {
  fulfillmentText?: string;
  fulfillmentMessages?: Array<{
    text?: {
      text?: string[];
    };
    platform?: string;
  }>;
  queryResult?: {
    fulfillmentText?: string;
    fulfillmentMessages?: Array<{
      text?: {
        text?: string[];
      };
    }>;
  };
}

export class DialogflowService {
  private static webhookUrl = 'https://dialogflow-twilio-771370131463.us-central1.run.app';
  
  /**
   * Sends a text message to Dialogflow webhook and returns the response
   */
  static async sendMessage(message: string): Promise<string> {
    try {
      console.log(`Sending message to Dialogflow webhook: ${message}`);
      
      // Create a unique session ID for this conversation
      const sessionId = this.generateSessionId();
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          session: sessionId,
          queryInput: {
            text: {
              text: message,
              languageCode: 'en-US'
            }
          }
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: WebhookResponse = await response.json();
      console.log('Received response from Dialogflow:', data);
      
      // Extract the response text from various possible response formats
      let responseText = '';
      
      if (data.fulfillmentText) {
        responseText = data.fulfillmentText;
      } else if (data.queryResult?.fulfillmentText) {
        responseText = data.queryResult.fulfillmentText;
      } else if (data.fulfillmentMessages && data.fulfillmentMessages.length > 0) {
        const textMessage = data.fulfillmentMessages.find(msg => msg.text);
        if (textMessage?.text?.text && textMessage.text.text.length > 0) {
          responseText = textMessage.text.text[0];
        }
      } else if (data.queryResult?.fulfillmentMessages && data.queryResult.fulfillmentMessages.length > 0) {
        const textMessage = data.queryResult.fulfillmentMessages.find(msg => msg.text);
        if (textMessage?.text?.text && textMessage.text.text.length > 0) {
          responseText = textMessage.text.text[0];
        }
      }
      
      return responseText || "I received your message but couldn't generate a response.";
      
    } catch (error) {
      console.error('Error communicating with Dialogflow webhook:', error);
      return "Sorry, I encountered an error while processing your request. Please try again.";
    }
  }

  /**
   * Generate a unique session ID for the conversation
   */
  private static generateSessionId(): string {
    return `web-session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
