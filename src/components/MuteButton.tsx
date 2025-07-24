import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MuteButtonProps {
  isMuted: boolean;
  onToggleMute: () => void;
}

const MuteButton: React.FC<MuteButtonProps> = ({ isMuted, onToggleMute }) => {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggleMute}
      className={`flex items-center gap-2 border-primary/30 transition-all duration-300 ${
        isMuted 
          ? 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20' 
          : 'hover:bg-primary/10 text-foreground'
      }`}
      title={isMuted ? 'Unmute audio' : 'Mute audio'}
    >
      {isMuted ? (
        <VolumeX className="h-4 w-4" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {isMuted ? 'Unmute' : 'Mute'}
      </span>
    </Button>
  );
};

export default MuteButton;