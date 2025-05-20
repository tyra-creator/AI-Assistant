
import React, { useState, useEffect } from 'react';
import { Calendar, MessageCircle } from 'lucide-react';
import Header from '@/components/Header';
import WaveCircle from '@/components/WaveCircle';
import VoiceButton from '@/components/VoiceButton';
import TextInput from '@/components/TextInput';
import ResponseCard from '@/components/ResponseCard';
import NotificationCard, { EventNotification } from '@/components/NotificationCard';

const Index = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");
  const [notifications, setNotifications] = useState<EventNotification[]>([]);

  // Sample data - in a real app, this would come from Google Calendar API
  useEffect(() => {
    const sampleNotifications: EventNotification[] = [
      {
        id: '1',
        title: 'Team Meeting',
        datetime: '2025-05-20T14:00:00',
        description: 'Weekly progress update with the development team'
      },
      {
        id: '2',
        title: 'Project Deadline',
        datetime: '2025-05-21T18:00:00',
        description: 'Final submission for the Q2 project'
      },
      {
        id: '3',
        title: 'Doctor Appointment',
        datetime: '2025-05-23T10:30:00',
        description: 'Annual health checkup'
      }
    ];
    
    setNotifications(sampleNotifications);
  }, []);

  const toggleListening = () => {
    setIsListening(!isListening);
    
    // Simulate voice recognition result after 2 seconds when starting to listen
    if (!isListening) {
      setTimeout(() => {
        processUserInput("What's my schedule for today?");
        setIsListening(false);
      }, 2000);
    }
  };

  const processUserInput = (text: string) => {
    setActiveMessage(`Processing: "${text}"`);
    
    // Simulate AI response after 1 second
    setTimeout(() => {
      const response = "You have a team meeting at 2:00 PM today and a project deadline tomorrow at 6:00 PM.";
      setActiveMessage(response);
      speakResponse(response);
    }, 1000);
  };

  const speakResponse = (text: string) => {
    setIsSpeaking(true);
    
    // Simulate speech duration based on text length
    const speakingDuration = Math.max(2000, text.length * 80);
    
    setTimeout(() => {
      setIsSpeaking(false);
    }, speakingDuration);
  };

  const handleTextSubmit = (text: string) => {
    processUserInput(text);
  };

  return (
    <div className="flex flex-col min-h-screen bg-jarvis-bg text-jarvis-text">
      <Header />
      
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <div className="md:w-80 p-6 border-r border-jarvis-primary/30 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-jarvis-accent" />
            Upcoming Events
          </h2>
          
          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <NotificationCard key={notification.id} notification={notification} />
              ))}
            </div>
          ) : (
            <p className="text-jarvis-text-muted text-sm">No upcoming events</p>
          )}
        </div>
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-y-auto">
          <div className="w-full max-w-3xl flex flex-col items-center gap-8">
            <div className="flex items-center space-x-2 mt-6">
              <div className="bg-jarvis-accent rounded-full p-3">
                <MessageCircle className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold">Executive Assistant</h1>
            </div>
            
            {activeMessage && (
              <ResponseCard message={activeMessage} isSpeaking={isSpeaking} />
            )}
            
            <div className="mt-auto w-full">
              <div className="flex items-center gap-2 bg-jarvis-primary/10 p-2 rounded-lg border border-jarvis-secondary/20">
                <WaveCircle isActive={isListening || isSpeaking} />
                <TextInput onSubmit={handleTextSubmit} />
                <VoiceButton isListening={isListening} onClick={toggleListening} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
