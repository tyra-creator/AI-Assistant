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

  // Session cache to avoid repeated problematic getSession calls
  private static sessionCache: { session: any; timestamp: number } | null = null;
  private static readonly SESSION_CACHE_DURATION = 30000; // 30 seconds

  /**
   * Get session with timeout and fallback mechanisms
   */
  private static async getSessionWithFallback(): Promise<{ session: any; error?: any }> {
    console.log('=== Step 1: Getting session data ===');
    
    // Check cache first
    if (this.sessionCache && Date.now() - this.sessionCache.timestamp < this.SESSION_CACHE_DURATION) {
      console.log('Using cached session');
      return { session: this.sessionCache.session };
    }

    try {
      // Create timeout promise that rejects properly
      const timeoutPromise = new Promise<{ data: null; error: any }>((_, reject) => {
        setTimeout(() => reject(new Error('Session retrieval timeout after 15 seconds')), 15000);
      });

      // Create session promise with proper typing
      const sessionPromise = supabase.auth.getSession();

      console.log('Attempting session retrieval with 15s timeout...');
      
      // Race between session and timeout
      const result = await Promise.race([sessionPromise, timeoutPromise]);
      
      const { data: sessionData, error: sessionError } = result;
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error(`Session error: ${sessionError.message}`);
      }

      if (sessionData?.session) {
        // Cache the successful session
        this.sessionCache = {
          session: sessionData.session,
          timestamp: Date.now()
        };
        console.log('Session retrieved and cached successfully');
        return { session: sessionData.session };
      }

      console.warn('No session found in response');
      return { session: null, error: 'No session found' };

    } catch (error: any) {
      console.error('Session retrieval failed:', error.message);
      
      // Try to get session from current auth state as fallback
      try {
        console.log('Attempting session fallback from auth state...');
        const user = supabase.auth.getUser();
        
        // If we have a user, try to construct a minimal session
        if (user) {
          console.log('Fallback: found user in auth state');
          return { session: { user, access_token: 'fallback' } };
        }
      } catch (fallbackError) {
        console.error('Fallback session retrieval also failed:', fallbackError);
      }

      return { session: null, error: error.message };
    }
  }

  /**
   * Fetch calendar events via Supabase edge function
   */
  static async fetchCalendarEvents(date?: string, startDate?: string, endDate?: string) {
    console.log('=== APIService.fetchCalendarEvents CALLED ===');
    console.log('Parameters:', { date, startDate, endDate });
    
    try {
      const { session: sessionData, error: sessionError } = await this.getSessionWithFallback();
      
      if (sessionError || !sessionData) {
        console.error('No valid session found:', sessionError);
        return {
          events: [],
          needsAuth: true,
          error: sessionError || 'No valid authentication session found',
        };
      }
      
      const accessToken = sessionData?.access_token;
      console.log('Session retrieved:', {
        hasSession: !!sessionData,
        hasAccessToken: !!accessToken,
        userId: sessionData?.user?.id,
      });

      if (!accessToken) {
        console.error('No access token found in session');
        return {
          events: [],
          needsAuth: true,
          error: 'No access token found in session',
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
          // Generous timeouts to accommodate token refresh and calendar API calls
          const timeoutDuration = retryCount === 0 ? 35000 : 30000; // 35s first attempt, 30s retries
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Request timeout after ${timeoutDuration / 1000} seconds`)), timeoutDuration);
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

      // No retry for wider window - keep within 30 days max
      console.log('No events found in 30-day window, returning empty result');

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
