
import React from 'react';

interface VoiceVisualizerProps {
  isActive: boolean;
}

const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ isActive }) => {
  const bars = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div className={`flex items-end h-16 justify-center ${isActive ? 'opacity-100' : 'opacity-30'}`}>
      {bars.map((bar) => (
        <div 
          key={bar} 
          className={`voice-bar ${isActive ? 'animate-wave' : 'h-2'}`}
          style={{ 
            animationPlayState: isActive ? 'running' : 'paused',
            height: isActive ? undefined : '8px'
          }}
        />
      ))}
    </div>
  );
};

export default VoiceVisualizer;
