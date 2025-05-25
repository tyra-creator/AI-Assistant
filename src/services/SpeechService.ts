
// TypeScript definitions for the Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    start(): void;
    stop(): void;
  }

  interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    readonly [index: number]: SpeechRecognitionResult;
    readonly length: number;
  }

  interface SpeechRecognitionResult {
    readonly [index: number]: SpeechRecognitionAlternative;
    readonly isFinal: boolean;
    readonly length: number;
  }

  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
    message: string;
  }
}

/**
 * Service to handle speech recognition and text-to-speech functionality
 */
export class SpeechService {
  private static recognition: SpeechRecognition | null = null;
  private static speechSynthesis: SpeechSynthesisUtterance | null = null;
  private static isListening = false;
  private static onResultCallback: ((text: string) => void) | null = null;
  private static onEndCallback: (() => void) | null = null;

  /**
   * Initialize the speech recognition service
   */
  static initialize(): boolean {
    // Check if the browser supports the Web Speech API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech recognition not supported in this browser');
      return false;
    }

    try {
      // Initialize the SpeechRecognition object
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionAPI();
      
      // Configure speech recognition
      if (this.recognition) {
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        // Set up event listeners
        this.recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
          
          if (event.results[0].isFinal && this.onResultCallback) {
            this.onResultCallback(transcript);
          }
        };

        this.recognition.onend = () => {
          this.isListening = false;
          if (this.onEndCallback) {
            this.onEndCallback();
          }
        };

        this.recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          this.isListening = false;
          if (this.onEndCallback) {
            this.onEndCallback();
          }
        };
      }

      return true;
    } catch (error) {
      console.error('Error initializing speech recognition:', error);
      return false;
    }
  }

  /**
   * Start listening for speech input
   */
  static startListening(
    onResult: (text: string) => void,
    onEnd: () => void
  ): boolean {
    if (!this.recognition) {
      if (!this.initialize()) {
        return false;
      }
    }

    if (this.isListening) {
      return true;
    }

    try {
      this.onResultCallback = onResult;
      this.onEndCallback = onEnd;
      this.recognition?.start();
      this.isListening = true;
      return true;
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      return false;
    }
  }

  /**
   * Stop listening for speech input
   */
  static stopListening(): void {
    if (!this.recognition || !this.isListening) {
      return;
    }

    try {
      this.recognition.stop();
      this.isListening = false;
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
    }
  }

  /**
   * Check if speech recognition is currently active
   */
  static isRecognitionActive(): boolean {
    return this.isListening;
  }

  /**
   * Speak text using the browser's text-to-speech capabilities
   */
  static speak(text: string, onEnd?: () => void): void {
    if (!('speechSynthesis' in window)) {
      console.error('Text to speech not supported in this browser');
      if (onEnd) onEnd();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Create a new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure the utterance for female voice and faster speed
    utterance.lang = 'en-US';
    utterance.rate = 1.3; // Increased from 1.0 to 1.3 for faster speech
    utterance.pitch = 1.2; // Slightly higher pitch for more feminine sound
    utterance.volume = 1.0;

    // Try to select a female voice
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.toLowerCase().includes('female') || 
       voice.name.toLowerCase().includes('woman') ||
       voice.name.toLowerCase().includes('samantha') ||
       voice.name.toLowerCase().includes('victoria') ||
       voice.name.toLowerCase().includes('karen'))
    );
    
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    // Set the end callback if provided
    if (onEnd) {
      utterance.onend = () => {
        onEnd();
      };
    }

    // Speak the text
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Stop any ongoing speech
   */
  static stopSpeaking(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}
