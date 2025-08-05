import React, { useState, useEffect } from 'react';
import { Calendar, MessageCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import WaveCircle from '@/components/WaveCircle';
import VoiceButton from '@/components/VoiceButton';
import TextInput from '@/components/TextInput';
import ResponseCard from '@/components/ResponseCard';
import NotificationCard, { EventNotification } from '@/components/NotificationCard';
import MuteButton from '@/components/MuteButton';

import { APIService } from '@/services/APIService';
import { SpeechService } from '@/services/ModernTTSService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { fetchCalendarEvents } from '@/services/APIService';
import { supabase } from '@/integrations/supabase/client';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';

const Index = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");
  const [notifications, setNotifications] = useState<EventNotification[]>([]);
  const [isTitleHovered, setIsTitleHovered] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }
    };

    checkAuth();

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
  }, [navigate]);

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
      
      // Send the message to OpenAI assistant and get the response
      console.log('Sending message to assistant-chat function:', text);
      console.log('Calling Supabase function: assistant-chat');
      
      const requestBody = { message: text };
      console.log('Request body:', requestBody);
      
      // First, test if function is deployed with health check
      console.log('Testing function deployment...');
      try {
        const healthCheck = await fetch('https://xqnqssvypvwnedpaylwz.supabase.co/functions/v1/assistant-chat', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbnFzc3Z5cHZ3bmVkcGF5bHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1MTY1MjgsImV4cCI6MjA2OTA5MjUyOH0.zEo80CWmBR38anzKkcvZmXui7uvEQVhO9g_B7Q7WOmw`,
          }
        });
        
        if (!healthCheck.ok) {
          throw new Error(`Function not deployed - Health check failed: ${healthCheck.status}`);
        }
        
        const healthData = await healthCheck.json();
        console.log('Health check passed:', healthData);
      } catch (healthError) {
        console.error('Function deployment check failed:', healthError);
        setActiveMessage("❌ Assistant function is not deployed. Please check Supabase dashboard.");
        setIsProcessing(false);
        return;
      }

      // Use direct fetch call since supabase.functions.invoke is having issues
      console.log('Calling function directly via fetch...');
      
      const functionResponse = await fetch('https://xqnqssvypvwnedpaylwz.supabase.co/functions/v1/assistant-chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbnFzc3Z5cHZ3bmVkcGF5bHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1MTY1MjgsImV4cCI6MjA2OTA5MjUyOH0.zEo80CWmBR38anzKkcvZmXui7uvEQVhO9g_B7Q7WOmw`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!functionResponse.ok) {
        const errorText = await functionResponse.text();
        throw new Error(`Function call failed (${functionResponse.status}): ${errorText}`);
      }

      const data = await functionResponse.json();
      console.log('Function response received:', data);
      
      // Check for error in response
      if (data.error) {
        console.error('Function returned error:', data.error);
        throw new Error(data.error);
      }
      
      const response = data.response || "I couldn't generate a response.";
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

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    SpeechService.setMuted(newMutedState);
    
    toast({
      title: newMutedState ? "Audio Muted" : "Audio Unmuted",
      description: newMutedState ? "Voice responses are now muted" : "Voice responses are now enabled",
    });
  };

  // Stop speaking when component unmounts
  useEffect(() => {
    return () => {
      SpeechService.stopSpeaking();
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-background via-background to-accent/20 text-foreground">
      <Header />

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className="md:w-80 p-6 border-r border-primary/20 overflow-y-auto bg-card/30 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-montserrat font-semibold flex items-center text-foreground">
              <Calendar className="h-5 w-5 mr-2 text-accent" />
              Upcoming Events
            </h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={refreshEvents}
              className="flex items-center gap-1 border-primary/30 hover:bg-primary/10"
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
            <div className="text-center py-8">
              <Calendar className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No upcoming events</p>
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col items-center justify-between p-8 overflow-y-auto relative">
          <div className="w-full max-w-4xl flex flex-col items-center gap-8">
            <div className="flex items-center mt-8 justify-end w-full">
              <Button 
                variant="outline" 
                size="sm"
                onClick={resetConversation}
                className="flex items-center gap-2 border-primary/30 hover:bg-primary/10 text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                New Chat
              </Button>
            </div>

            {activeMessage && (
              <div className="w-full animate-fade-in">
                <ResponseCard message={activeMessage} isSpeaking={isSpeaking} />
              </div>
            )}

            <div className="mt-auto w-full max-w-2xl">
              <div className="flex items-center gap-3 bg-card/80 backdrop-blur-sm p-4 rounded-2xl border border-primary/20 shadow-lg">
                <WaveCircle isActive={isListening || isSpeaking} />
                <TextInput onSubmit={handleTextSubmit} />
                <MuteButton isMuted={isMuted} onToggleMute={toggleMute} />
                <VoiceButton isListening={isListening} onClick={toggleListening} />
              </div>
              {isProcessing && (
                <div className="flex items-center justify-center mt-4 gap-2">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                  <p className="text-sm text-muted-foreground animate-fade-in">
                    Processing your request...
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* User Profile Dropdown - Bottom Left */}
          <div className="absolute bottom-6 left-6">
            <UserProfileDropdown />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
