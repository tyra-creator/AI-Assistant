import { supabase } from '@/integrations/supabase/client';

// Service for handling calendar and other API requests via Supabase
export class APIService {
  // Session ID management - now using conversation IDs from database
  private static conversationId: string | null = null;
  
  /**
   * Get the current conversation ID
   */
  static getSessionId(): string | null {
    return this.conversationId;
  }
  
  /**
   * Set conversation ID
   */
  static setConversationId(id: string): void {
    this.conversationId = id;
  }
  
  /**
   * Reset the conversation (starts a new conversation)
   */
  static resetSession(): void {
    this.conversationId = null;
  }

  /**
   * Fetch calendar events via Supabase edge function
   */
  static async fetchCalendarEvents(date?: string, startDate?: string, endDate?: string) {
    try {
      const { data, error } = await supabase.functions.invoke('calendar-integration', {
        body: {
          action: 'get_events',
          date,
          timeMin: startDate,
          timeMax: endDate
        }
      });

      if (error) {
        console.error('Error from calendar function:', error);
        return {
          events: [],
          needsAuth: true,
          error: error.message || 'Calendar integration error'
        };
      }

      // Handle different response structures
      if (data?.needsAuth) {
        return {
          events: [],
          needsAuth: true,
          error: data.error || data.message || 'Authentication required'
        };
      }

      return {
        events: data?.events || [],
        needsAuth: false,
        error: null
      };
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      return {
        events: [],
        needsAuth: true,
        error: error.message || 'Failed to fetch calendar events'
      };
    }
  }

  /**
   * Send email via Supabase edge function
   */
  static async sendEmail(to: string, subject: string, body: string) {
    try {
      const { data, error } = await supabase.functions.invoke('email-integration', {
        body: {
          action: 'send',
          to,
          subject,
          body
        }
      });

      if (error) {
        console.error('Error from email function:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Get emails via Supabase edge function
   */
  static async getEmails(folder = 'inbox') {
    try {
      const { data, error } = await supabase.functions.invoke('email-integration', {
        body: {
          action: 'get_emails',
          folder
        }
      });

      if (error) {
        console.error('Error from email function:', error);
        throw error;
      }

      return data?.emails || [];
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }
}

// Export the fetchCalendarEvents function for backward compatibility
export const fetchCalendarEvents = async () => {
  return APIService.fetchCalendarEvents();
};
