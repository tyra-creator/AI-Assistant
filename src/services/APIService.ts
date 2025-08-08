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
      // Ensure we forward the user's JWT explicitly
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      console.log('Calling calendar-integration with payload:', {
        action: 'get_events',
        date,
        timeMin: startDate,
        timeMax: endDate,
        hasAuth: !!accessToken,
      });

      const invoke = async (body: any) =>
        supabase.functions.invoke('calendar-integration', {
          body,
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });

      // Initial request using provided range
      let { data, error } = await invoke({
        action: 'get_events',
        date,
        timeMin: startDate,
        timeMax: endDate,
      });
      console.log('Calendar function result:', { hasData: !!data, hasError: !!error, data, error });

      if (error) {
        console.error('Error from calendar function:', error);
        return {
          events: [],
          needsAuth: true,
          error: (error as any).message || 'Calendar integration error',
        };
      }

      // Handle needsAuth responses
      if (data?.needsAuth) {
        return {
          events: [],
          needsAuth: true,
          error: data.error || data.message || 'Authentication required',
        };
      }

      let events = data?.events || [];

      // Retry strategy if no events returned: widen window to 60d, then try timeMin only
      if (Array.isArray(events) && events.length === 0) {
        const nowIso = new Date().toISOString();
        const sixtyDaysIso = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

        console.log('No events returned, retrying with wider window (60 days)');
        ({ data, error } = await invoke({ action: 'get_events', timeMin: nowIso, timeMax: sixtyDaysIso }));
        console.log('Retry (60d) result:', { hasData: !!data, hasError: !!error, data, error });

        if (!error && !data?.needsAuth) {
          events = data?.events || [];
        }

        if (Array.isArray(events) && events.length === 0) {
          console.log('Still no events, retrying with timeMin only');
          ({ data, error } = await invoke({ action: 'get_events', timeMin: nowIso }));
          console.log('Retry (timeMin only) result:', { hasData: !!data, hasError: !!error, data, error });

          if (!error && !data?.needsAuth) {
            events = data?.events || [];
          }
        }
      }

      return {
        events,
        needsAuth: false,
        error: null,
      };
    } catch (error: any) {
      console.error('Error fetching calendar events:', error);
      return {
        events: [],
        needsAuth: true,
        error: error?.message || 'Failed to fetch calendar events',
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
