
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import VoiceVisualizer from './VoiceVisualizer';

interface ResponseCardProps {
  message: string;
  isSpeaking: boolean;
}

const ResponseCard: React.FC<ResponseCardProps> = ({ message, isSpeaking }) => {
  return (
    <Card className="w-full bg-jarvis-primary/20 border-jarvis-secondary/30 shadow-lg">
      <CardContent className="p-6">
        <div className="flex flex-col items-center">
          <VoiceVisualizer isActive={isSpeaking} />
          <div className="mt-4 text-jarvis-text text-lg">
            {message || "I'm waiting for your command..."}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ResponseCard;
