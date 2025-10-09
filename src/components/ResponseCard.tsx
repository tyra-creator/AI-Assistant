
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import VoiceVisualizer from './VoiceVisualizer';

interface ResponseCardProps {
  message: string;
  isSpeaking: boolean;
}

// Helper function to parse message and convert URLs to clickable links
const parseMessageWithLinks = (message: string) => {
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = message.split(urlRegex);
  
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600 underline"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

const ResponseCard: React.FC<ResponseCardProps> = ({ message, isSpeaking }) => {
  return (
    <Card className="w-full bg-jarvis-primary/20 border-jarvis-secondary/30 shadow-lg">
      <CardContent className="p-6">
        <div className="flex flex-col items-center">
          <VoiceVisualizer isActive={isSpeaking} />
          <div className={`mt-4 text-jarvis-text text-lg ${isSpeaking ? 'text-accent' : ''}`}>
            {message ? parseMessageWithLinks(message) : "I'm waiting for your command..."}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ResponseCard;
