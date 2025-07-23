// Generic service for handling API requests
export class APIService {
  // Session ID management - in a real app, this would be persisted
  private static sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  
  /**
   * Get the current session ID
   */
  static getSessionId(): string {
    return this.sessionId;
  }
  
  /**
   * Reset the session ID (starts a new conversation)
   */
  static resetSession(): void {
    this.sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Make a POST request to the backend API
   */
  static async post<T>(endpoint: string, data: any): Promise<T> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  /**
   * Fetch calendar events from the backend
   */
  static async fetchCalendarEvents() {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/calendar/events`);
      if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }
}

// Export the fetchCalendarEvents function for use in other modules
export const fetchCalendarEvents = async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/calendar/events`);
    if (!response.ok) {
      throw new Error('Failed to fetch calendar events');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
};
