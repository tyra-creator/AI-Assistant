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
    console.log('=== APIService.fetchCalendarEvents CALLED ===');
    console.log('Parameters:', { date, startDate, endDate });
    
    try {
      console.log('=== Step 1: Getting session data ===');
      
      // Add timeout protection to session retrieval
      const sessionTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session retrieval timeout after 10 seconds')), 10000);
      });
      
      const sessionPromise = supabase.auth.getSession();
      
      // Race between session retrieval and timeout
      const { data: sessionData, error: sessionError } = await Promise.race([
        sessionPromise,
        sessionTimeoutPromise
      ]);
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      const accessToken = sessionData?.session?.access_token;
      console.log('Session retrieved:', {
        hasSession: !!sessionData?.session,
        hasAccessToken: !!accessToken,
        userId: sessionData?.session?.user?.id,
        sessionError: sessionError
      });

      if (!sessionData?.session || !accessToken) {
        console.error('No valid session or access token found');
        return {
          events: [],
          needsAuth: true,
          error: 'No valid authentication session found',
        };
      }

      console.log('=== Step 2: Preparing date range ===');
      const nowIso = new Date().toISOString();
      const defaultEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      let effectiveTimeMin = startDate || nowIso;
      let effectiveTimeMax = endDate || defaultEndIso;

      console.log('=== Calendar Integration Client Call ===');
      console.log('Calling calendar-integration with payload:', {
        action: 'get_events',
        date,
        timeMin: effectiveTimeMin,
        timeMax: effectiveTimeMax,
      });

      const invoke = async (body: any, retryCount = 0) => {
        console.log(`=== Step 3: Invoking calendar-integration (attempt ${retryCount + 1}) ===`);
        
        try {
          // Add timeout wrapper
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000);
          });
          
          const requestPromise = supabase.functions.invoke('calendar-integration', {
            body,
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
          });
          
          const result = await Promise.race([requestPromise, timeoutPromise]) as any;
          
          console.log('Raw edge function response:', {
            hasData: !!result.data,
            hasError: !!result.error,
            data: result.data,
            error: result.error,
            attempt: retryCount + 1
          });
          
          // If we get a network error or timeout, retry up to 2 times
          if (result.error && retryCount < 2) {
            console.log(`Retrying request (attempt ${retryCount + 2}) due to error:`, result.error);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
            return invoke(body, retryCount + 1);
          }
          
          return result;
          
        } catch (invokeError: any) {
          console.error('Calendar function invocation error:', invokeError);
          
          if (retryCount < 2) {
            console.log(`Retrying due to exception (attempt ${retryCount + 2}):`, invokeError.message);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return invoke(body, retryCount + 1);
          }
          
          return {
            data: null,
            error: {
              message: invokeError.message || 'Failed to invoke calendar function',
              code: invokeError.code || 'INVOKE_ERROR'
            }
          };
        }
      };

      console.log('=== Step 4: Making initial request ===');
      // Initial request using provided range
      let { data, error } = await invoke({
        action: 'get_events',
        date,
        timeMin: effectiveTimeMin,
        timeMax: effectiveTimeMax,
      });

      console.log('=== Step 5: Processing initial response ===');
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
        console.log('Authentication required response from calendar function');
        return {
          events: [],
          needsAuth: true,
          error: data.error || data.message || 'Authentication required',
        };
      }

      let events = data?.events || [];
      console.log('Initial events received:', events.length);

      // Retry strategy if no events returned: widen window to 60d (bounded)
      if (Array.isArray(events) && events.length === 0) {
        console.log('=== Step 6: No events found, retrying with wider window ===');
        const sixtyDaysEndIso = new Date(new Date(effectiveTimeMin).getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

        console.log('No events returned, retrying with wider window (60 days, bounded)');
        ({ data, error } = await invoke({ action: 'get_events', timeMin: effectiveTimeMin, timeMax: sixtyDaysEndIso }));
        console.log('Retry (60d) result:', { hasData: !!data, hasError: !!error, data, error });

        if (!error && !data?.needsAuth) {
          events = data?.events || [];
          effectiveTimeMax = sixtyDaysEndIso;
          console.log('Retry events received:', events.length);
        }
      }

      console.log('=== Step 7: Filtering events within date range ===');
      // Final safety filter to ensure events are within the requested window
      try {
        const minIso = new Date(effectiveTimeMin).toISOString();
        const maxIso = new Date(effectiveTimeMax).toISOString();
        const beforeCount = Array.isArray(events) ? events.length : 0;
        events = (events || []).filter((e: any) => {
          const start = e?.start?.dateTime || e?.start?.date || e?.start;
          if (!start) return true;
          const startIso = new Date(start).toISOString();
          return startIso >= minIso && startIso <= maxIso;
        });
        console.log('Filtered events within range:', { beforeCount, afterCount: events.length, minIso, maxIso });
      } catch (e) {
        console.warn('Event range filter skipped due to parse error:', e);
      }

      console.log('=== Step 8: Returning successful response ===');
      console.log('Final events count:', events.length);
      return {
        events,
        needsAuth: false,
        error: null,
      };
    } catch (error: any) {
      console.error('=== CRITICAL ERROR in fetchCalendarEvents ===');
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      });
      
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
