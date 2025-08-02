
import { supabase } from '@/integrations/supabase/client';

interface AssistantResponse {
  response: string;
  conversationId: string;
}

export class DialogflowService {
  /**
   * Sends a text message to the AI assistant via Supabase edge function
   */
  static async sendMessage(message: string, conversationId?: string): Promise<string> {
    try {
      console.log(`Sending message to AI assistant: ${message}`);
      
      const { data, error } = await supabase.functions.invoke<AssistantResponse>('assistant-chat', {
        body: {
          message: message,
          conversationId: conversationId
        }
      });
      
      if (error) {
        console.error('Error from assistant function:', error);
        throw error;
      }
      
      console.log('Received response from AI assistant:', data);
      
      return data?.response || "I received your message but couldn't generate a response.";
      
    } catch (error) {
      console.error('Error communicating with AI assistant:', error);
      return "Sorry, I encountered an error while processing your request. Please try again.";
    }
  }
}
