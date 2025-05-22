
// Generic service for handling API requests
export class APIService {
  // Base URL for your backend proxy server
  // In production, replace this with your actual backend URL
  private static baseURL = 'https://your-backend-proxy.com/api';
  
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
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }
}
