
import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        "relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 focus:outline-none",
        isListening 
          ? "bg-jarvis-accent text-white" 
          : "bg-jarvis-secondary text-white hover:bg-jarvis-secondary/90",
        className
      )}
    >
      {isListening ? (
        <>
          <MicOff className="h-6 w-6" />
          <div className="absolute -inset-3">
            <div className="w-full h-full rounded-full animate-pulse-ring bg-jarvis-accent/20"></div>
          </div>
        </>
      ) : (
        <Mic className="h-6 w-6" />
      )}
    </button>
  );
};

export default VoiceButton;
