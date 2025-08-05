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

import { KokoroTTS } from 'kokoro-js';

/**
 * Modern TTS Service with Kokoro.js integration and fallback to browser TTS
 */
export class ModernTTSService {
  private static recognition: SpeechRecognition | null = null;
  private static isListening = false;
  private static isMuted = false;
  private static onResultCallback: ((text: string) => void) | null = null;
  private static onEndCallback: (() => void) | null = null;
  
  // Kokoro TTS
  private static kokoroTTS: any = null;
  private static isKokoroLoading = false;
  private static kokoroLoadAttempted = false;
  
  // Fallback browser TTS
  private static selectedVoice: SpeechSynthesisVoice | null = null;
  private static voices: SpeechSynthesisVoice[] = [];

  /**
   * Initialize the speech recognition service
   */
  static initialize(): boolean {
    // Check if the browser supports the Web Speech API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech recognition not supported in this browser');
      return false;
    }

    // Load voices for fallback
    this.loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', this.loadVoices);

    // Initialize Kokoro TTS asynchronously
    this.initializeKokoro();

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

  private static async initializeKokoro() {
    if (this.kokoroLoadAttempted || this.isKokoroLoading) {
      return;
    }

    this.isKokoroLoading = true;
    this.kokoroLoadAttempted = true;

    try {
      console.log('Loading Kokoro TTS model...');
      const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
      this.kokoroTTS = await KokoroTTS.from_pretrained(model_id, {
        dtype: "q8", // Optimized for performance and size
        device: "wasm", // Use WASM for better compatibility
      });
      console.log('Kokoro TTS model loaded successfully');
    } catch (error) {
      console.warn('Failed to load Kokoro TTS, falling back to browser TTS:', error);
      this.kokoroTTS = null;
    } finally {
      this.isKokoroLoading = false;
    }
  }

  private static loadVoices() {
    this.voices = window.speechSynthesis.getVoices();

    // Prioritize specific female voice names
    const preferredVoices = ['Samantha', 'Victoria', 'Karen', 'Google UK English Female', 'Google US English Female'];
    this.selectedVoice = this.voices.find(voice => 
      preferredVoices.some(preferred => voice.name.includes(preferred))
    ) || null;

    // Fallback to any voice with 'female' in the name if no preferred voice is found
    if (!this.selectedVoice) {
      this.selectedVoice = this.voices.find(voice => voice.name.toLowerCase().includes('female')) || null;
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
   * Speak text using Kokoro TTS with fallback to browser TTS
   */
  static async speak(text: string, onEnd?: () => void) {
    // Don't speak if muted
    if (this.isMuted) {
      if (onEnd) onEnd();
      return;
    }

    try {
      // Try Kokoro TTS first
      if (this.kokoroTTS && !this.isKokoroLoading) {
        await this.speakWithKokoro(text, onEnd);
        return;
      }
      
      // If Kokoro is still loading, wait a bit and try again
      if (this.isKokoroLoading) {
        setTimeout(() => this.speak(text, onEnd), 100);
        return;
      }
    } catch (error) {
      console.warn('Kokoro TTS failed, falling back to browser TTS:', error);
    }

    // Fallback to browser TTS
    this.speakWithBrowserTTS(text, onEnd);
  }

  private static async speakWithKokoro(text: string, onEnd?: () => void) {
    try {
      const audio = await this.kokoroTTS.generate(text, {
        voice: "af_heart", // High-quality female voice
      });
      
      // Convert to audio element and play
      const audioBlob = new Blob([audio.audio], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioElement = new Audio(audioUrl);
      
      audioElement.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (onEnd) onEnd();
      };
      
      audioElement.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        console.warn('Kokoro audio playback failed, falling back to browser TTS');
        this.speakWithBrowserTTS(text, onEnd);
      };
      
      await audioElement.play();
    } catch (error) {
      console.warn('Kokoro generation failed:', error);
      this.speakWithBrowserTTS(text, onEnd);
    }
  }

  private static speakWithBrowserTTS(text: string, onEnd?: () => void) {
    const utterance = new SpeechSynthesisUtterance(text);

    // Ensure the selected voice is set
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

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

  /**
   * Set mute state for audio output
   */
  static setMuted(muted: boolean): void {
    this.isMuted = muted;
    // If muting, stop any current speech
    if (muted) {
      this.stopSpeaking();
    }
  }

  /**
   * Get current mute state
   */
  static isMutedState(): boolean {
    return this.isMuted;
  }

  /**
   * Check if Kokoro TTS is available
   */
  static isKokoroAvailable(): boolean {
    return this.kokoroTTS !== null;
  }

  /**
   * Check if Kokoro TTS is currently loading
   */
  static isKokoroTTSLoading(): boolean {
    return this.isKokoroLoading;
  }
}

// Export as SpeechService for backward compatibility
export const SpeechService = ModernTTSService;