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

import { supabase } from '@/integrations/supabase/client';

/**
 * Modern TTS Service with OpenAI TTS and fallback to browser TTS
 */
export class ModernTTSService {
  private static recognition: SpeechRecognition | null = null;
  private static isListening = false;
  private static isMuted = false;
  private static onResultCallback: ((text: string) => void) | null = null;
  private static onEndCallback: (() => void) | null = null;
  
  // Fallback browser TTS
  private static selectedVoice: SpeechSynthesisVoice | null = null;
  private static voices: SpeechSynthesisVoice[] = [];
  
  // Audio cache for repeated phrases
  private static audioCache = new Map<string, string>();

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
   * Speak text using OpenAI TTS with fallback to browser TTS
   */
  static async speak(text: string, onEnd?: () => void) {
    // Don't speak if muted
    if (this.isMuted) {
      if (onEnd) onEnd();
      return;
    }

    try {
      // Check cache first
      const cacheKey = text.toLowerCase().trim();
      if (this.audioCache.has(cacheKey)) {
        console.log('Using cached audio');
        this.playAudioFromBase64(this.audioCache.get(cacheKey)!, onEnd);
        return;
      }

      // Use OpenAI TTS via Supabase function
      console.log('Generating speech with OpenAI TTS...');
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { 
          text,
          voice: 'nova' // Warm, engaging female voice
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.audioContent) {
        // Cache the audio
        this.audioCache.set(cacheKey, data.audioContent);
        
        // Play the audio
        this.playAudioFromBase64(data.audioContent, onEnd);
        return;
      }
    } catch (error) {
      console.warn('OpenAI TTS failed, falling back to browser TTS:', error);
    }

    // Fallback to browser TTS
    this.speakWithBrowserTTS(text, onEnd);
  }

  private static playAudioFromBase64(base64Audio: string, onEnd?: () => void) {
    try {
      // Convert base64 to blob
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioElement = new Audio(audioUrl);
      
      audioElement.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (onEnd) onEnd();
      };
      
      audioElement.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        console.warn('Audio playback failed');
        if (onEnd) onEnd();
      };
      
      audioElement.play().catch(error => {
        console.warn('Audio play failed:', error);
        URL.revokeObjectURL(audioUrl);
        if (onEnd) onEnd();
      });
    } catch (error) {
      console.warn('Audio processing failed:', error);
      if (onEnd) onEnd();
    }
  }

  private static speakWithBrowserTTS(text: string, onEnd?: () => void) {
    const utterance = new SpeechSynthesisUtterance(text);

    // Enhance browser TTS settings
    utterance.rate = 1.1; // Slightly faster
    utterance.pitch = 1.1; // Slightly higher pitch for more pleasant sound
    utterance.volume = 0.9;

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
   * Clear audio cache
   */
  static clearCache(): void {
    this.audioCache.clear();
  }
}

// Export as SpeechService for backward compatibility
export const SpeechService = ModernTTSService;