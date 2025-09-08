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

  // Session cache and request debouncing
  private static sessionCache: { session: any; timestamp: number } | null = null;
  private static readonly SESSION_CACHE_DURATION = 60000; // 1 minute
  private static pendingCalendarRequests = new Map<string, Promise<any>>();
  private static sessionPromise: Promise<{ session: any; error?: any }> | null = null;

  /**
   * Get session with proper caching and validation
   */
  private static async getSessionWithFallback(): Promise<{ session: any; error?: any }> {
    console.log('=== Step 1: Getting session data ===');
    
    // Check cache first - enhanced validation
    if (this.sessionCache && Date.now() - this.sessionCache.timestamp < this.SESSION_CACHE_DURATION) {
      console.log('Using cached session');
      // Validate cached session
      if (this.sessionCache.session?.access_token && this.sessionCache.session?.access_token !== 'fallback') {
        return { session: this.sessionCache.session };
      } else {
        console.log('Cached session invalid, clearing cache');
        this.sessionCache = null;
      }
    }

    // Use singleton pattern to prevent multiple concurrent session requests
    if (this.sessionPromise) {
      console.log('Waiting for existing session request...');
      return await this.sessionPromise;
    }

    this.sessionPromise = this.performSessionRetrieval();
    try {
      const result = await this.sessionPromise;
      return result;
    } finally {
      this.sessionPromise = null;
    }
  }

  private static async performSessionRetrieval(): Promise<{ session: any; error?: any }> {
    try {
      console.log('Attempting session retrieval with 5s timeout...');
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session retrieval timeout after 5 seconds')), 5000);
      });

      const sessionPromise = supabase.auth.getSession();
      const result = await Promise.race([sessionPromise, timeoutPromise]);
      
      const { data: sessionData, error: sessionError } = result;
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error(`Session error: ${sessionError.message}`);
      }

      if (sessionData?.session?.access_token) {
        // Cache the successful session
        this.sessionCache = {
          session: sessionData.session,
          timestamp: Date.now()
        };
        console.log('Session retrieved and cached successfully');
        return { session: sessionData.session };
      }

      throw new Error('No valid session found');

    } catch (error: any) {
      console.error('Session retrieval failed:', error.message);
      
      // Try to get current auth state as fallback - but get a real session
      try {
        console.log('Attempting auth state fallback...');
        const { data: userData } = await supabase.auth.getUser();
        
        if (userData?.user) {
          console.log('Fallback: constructing session from auth state');
          // Try to get a fresh session one more time with shorter timeout
          try {
            const quickSessionPromise = supabase.auth.getSession();
            const quickTimeout = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Quick session timeout')), 2000);
            });
            
            const quickResult = await Promise.race([quickSessionPromise, quickTimeout]);
            if (quickResult.data?.session?.access_token) {
              this.sessionCache = {
                session: quickResult.data.session,
                timestamp: Date.now()
              };
              return { session: quickResult.data.session };
            }
          } catch (quickError) {
            console.log('Quick session retrieval failed, using current user data');
          }
          
          // Last resort - construct minimal session
          const fallbackSession = {
            user: userData.user,
            access_token: userData.user.id, // Use user ID as fallback token
            refresh_token: null,
            expires_at: Date.now() + 3600000 // 1 hour from now
          };
          
          return { session: fallbackSession };
        }
      } catch (fallbackError) {
        console.error('Fallback session retrieval failed:', fallbackError);
      }

      return { session: null, error: error.message };
    }
  }

  /**
   * Fetch calendar events via Supabase edge function with request debouncing
   */
  static async fetchCalendarEvents(date?: string, startDate?: string, endDate?: string) {
    console.log('=== APIService.fetchCalendarEvents CALLED ===');
    console.log('Parameters:', { date, startDate, endDate });
    
    // Create request key for debouncing
    const requestKey = `${date || 'none'}-${startDate || 'none'}-${endDate || 'none'}`;
    
    // Check if there's already a pending request for the same parameters
    if (this.pendingCalendarRequests.has(requestKey)) {
      console.log('Debouncing: returning existing request for same parameters');
      return await this.pendingCalendarRequests.get(requestKey)!;
    }
    
    // Create the request promise
    const requestPromise = this.performCalendarRequest(date, startDate, endDate);
    
    // Store the promise for debouncing
    this.pendingCalendarRequests.set(requestKey, requestPromise);
    
    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up the pending request
      this.pendingCalendarRequests.delete(requestKey);
    }
  }

  private static async performCalendarRequest(date?: string, startDate?: string, endDate?: string) {
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
          // Optimized timeouts - shorter for better user experience
          const timeoutDuration = retryCount === 0 ? 20000 : 15000; // 20s first attempt, 15s retries
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
          
          console.log('Edge function response summary:', {
            hasData: !!result.data,
            hasError: !!result.error,
            status: result.data?.status || 'unknown',
            attempt: retryCount + 1
          });
          
          // Success or recoverable error
          if (!result.error || result.data) {
            return result;
          }
          
          // Only retry on network/timeout errors, not auth errors
          const isRetryable = result.error && (
            result.error.message?.includes('timeout') ||
            result.error.message?.includes('network') ||
            result.error.message?.includes('connection')
          );
          
          if (isRetryable && retryCount < 1) { // Reduced from 2 to 1 retry
            console.log(`Retrying request (attempt ${retryCount + 2}) due to retryable error:`, result.error);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Fixed 2s delay
            return invoke(body, retryCount + 1);
          }
          
          return result;
          
        } catch (invokeError: any) {
          console.error('Calendar function invocation error:', invokeError);
          
          const isTimeoutError = invokeError.message?.includes('timeout');
          
          if (isTimeoutError && retryCount < 1) {
            console.log(`Retrying due to timeout (attempt ${retryCount + 2})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
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
