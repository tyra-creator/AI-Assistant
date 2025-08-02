
import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpeechService } from '@/services/SpeechService';

interface VoiceButtonProps {
  isListening: boolean;
  onClick: () => void;
  className?: string;
}

const VoiceButton: React.FC<VoiceButtonProps> = ({ 
  isListening, 
  onClick, 
  className 
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 focus:outline-none shadow-lg hover:shadow-xl transform hover:scale-105",
        isListening 
          ? "bg-gradient-to-br from-accent to-accent/80 text-accent-foreground shadow-accent/30" 
          : "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary/80 shadow-primary/20",
        className
      )}
      aria-label={isListening ? "Stop listening" : "Start listening"}
      title={isListening ? "Stop listening" : "Start listening"}
    >
      {isListening ? (
        <>
          <MicOff className="h-6 w-6" />
          <div className="absolute -inset-3">
            <div className="w-full h-full rounded-full animate-pulse-ring bg-accent/30"></div>
          </div>
          <div className="absolute -inset-1">
            <div className="w-full h-full rounded-full bg-gradient-to-r from-accent/20 to-accent/40 animate-pulse"></div>
          </div>
        </>
      ) : (
        <Mic className="h-6 w-6" />
      )}
    </button>
  );
};

export default VoiceButton;
