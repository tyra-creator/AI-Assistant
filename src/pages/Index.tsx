import React, { useState, useEffect } from 'react';
import { Calendar, MessageCircle, RefreshCw } from 'lucide-react';
import Header from '@/components/Header';
import WaveCircle from '@/components/WaveCircle';
import VoiceButton from '@/components/VoiceButton';
import TextInput from '@/components/TextInput';
import ResponseCard from '@/components/ResponseCard';
import NotificationCard, { EventNotification } from '@/components/NotificationCard';
import { DialogflowService } from '@/services/DialogflowService';
import { APIService } from '@/services/APIService';
import { SpeechService } from '@/services/SpeechService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { fetchCalendarEvents } from '@/services/APIService';

const Index = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");
  const [notifications, setNotifications] = useState<EventNotification[]>([]);
  const [isTitleHovered, setIsTitleHovered] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    const getEvents = async () => {
      try {
        const data = await fetchCalendarEvents();
        const calendarEvents = data.events.map((event) => ({
          id: event.id,
          title: event.summary,
          datetime: event.start.dateTime || event.start.date,
          description: event.description || 'No description available',
        }));
        setNotifications(calendarEvents);
      } catch (err) {
        setError(err.message);
      }
    };

    getEvents();

    // Initialize speech services
    SpeechService.initialize();
  }, []);

  const toggleListening = () => {
    if (isListening) {
      SpeechService.stopListening();
      setIsListening(false);
    } else {
      const success = SpeechService.startListening(
        (text) => {
          // Process the recognized speech
          processUserInput(text);
        },
        () => {
          // Called when speech recognition ends
          setIsListening(false);
        }
      );

      if (success) {
        setIsListening(true);
        setActiveMessage("I'm listening...");
      } else {
        toast({
          title: "Speech Recognition Error",
          description: "Could not start speech recognition. Try again or use text input.",
          variant: "destructive",
        });
      }
    }
  };

  const processUserInput = async (text: string) => {
    setActiveMessage(`Processing: "${text}"`);
    setIsProcessing(true);
    
    try {
      // Add user message to conversation history
      setConversationHistory(prev => [...prev, { role: 'user', content: text }]);
      
      // Send the message to Dialogflow and get the response
      const response = await DialogflowService.sendMessage(text);
      setActiveMessage(response);
      
      // Add assistant response to conversation history
      setConversationHistory(prev => [...prev, { role: 'assistant', content: response }]);
      
      speakResponse(response);
    } catch (error) {
      console.error('Error processing request:', error);
      toast({
        title: "Error",
        description: "Failed to process your request. Please try again.",
        variant: "destructive",
      });
      setActiveMessage("Sorry, I couldn't process your request at this time.");
    } finally {
      setIsProcessing(false);
    }
  };

  const speakResponse = (text: string) => {
    setIsSpeaking(true);
    
    SpeechService.speak(text, () => {
      setIsSpeaking(false);
    });
  };

  const handleTextSubmit = (text: string) => {
    processUserInput(text);
  };

  const handleTitleClick = () => {
    processUserInput("Hello");
  };

  const resetConversation = () => {
    // Reset session ID to start a new conversation
    APIService.resetSession();
    setConversationHistory([]);
    setActiveMessage("");
    SpeechService.stopSpeaking(); // Stop any ongoing speech
    toast({
      title: "Conversation Reset",
      description: "Started a new conversation session.",
    });
  };

  const refreshEvents = async () => {
    setIsProcessing(true);
    try {
      const data = await fetchCalendarEvents();
      const calendarEvents = data.events.map((event) => ({
        id: event.id,
        title: event.summary,
        datetime: event.start.dateTime || event.start.date,
        description: event.description || 'No description available',
      }));
      setNotifications(calendarEvents);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Stop speaking when component unmounts
  useEffect(() => {
    return () => {
      SpeechService.stopSpeaking();
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className="md:w-80 p-6 border-r border-primary/30 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-accent" />
              Upcoming Events
            </h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={refreshEvents}
              className="flex items-center gap-1"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <NotificationCard key={notification.id} notification={notification} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No upcoming events</p>
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-y-auto">
          <div className="w-full max-w-3xl flex flex-col items-center gap-8">
            <div className="flex items-center mt-6 justify-between w-full">
              <h1 
                className={`text-2xl font-bold cursor-pointer relative transition-all duration-300 ${
                  isTitleHovered ? 'text-accent' : 'text-foreground'
                }`}
                onClick={handleTitleClick}
                onMouseEnter={() => setIsTitleHovered(true)}
                onMouseLeave={() => setIsTitleHovered(false)}
              >
                Executive Assistant
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-accent shadow-glow"></span>
              </h1>

              <Button 
                variant="outline" 
                size="sm"
                onClick={resetConversation}
                className="flex items-center gap-1"
              >
                <RefreshCw className="h-4 w-4" />
                New Conversation
              </Button>
            </div>

            {activeMessage && (
              <ResponseCard message={activeMessage} isSpeaking={isSpeaking} />
            )}

            <div className="mt-auto w-full">
              <div className="flex items-center gap-2 bg-primary/10 p-2 rounded-lg border border-secondary/20">
                <WaveCircle isActive={isListening || isSpeaking} />
                <TextInput onSubmit={handleTextSubmit} />
                <VoiceButton isListening={isListening} onClick={toggleListening} />
              </div>
              {isProcessing && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Connecting to Dialogflow (executiveassistant-thyy)...
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
