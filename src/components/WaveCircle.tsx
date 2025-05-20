
import React from 'react';

interface WaveCircleProps {
  isActive: boolean;
}

const WaveCircle: React.FC<WaveCircleProps> = ({ isActive }) => {
  return (
    <div className={`flex items-center justify-center h-10 w-10 rounded-full ${isActive ? 'bg-jarvis-accent/20' : 'bg-jarvis-secondary/10'} transition-all duration-300`}>
      <div className={`h-5 w-5 rounded-full flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-jarvis-accent' : 'bg-jarvis-secondary/30'}`}>
        {isActive && (
          <div className="absolute animate-pulse-ring bg-jarvis-accent/20 h-10 w-10 rounded-full"></div>
        )}
      </div>
    </div>
  );
};

export default WaveCircle;
