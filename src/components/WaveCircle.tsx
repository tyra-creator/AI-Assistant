
import React from 'react';

interface WaveCircleProps {
  isActive: boolean;
}

const WaveCircle: React.FC<WaveCircleProps> = ({ isActive }) => {
  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      {isActive && (
        <>
          <div className="absolute w-full h-full rounded-full bg-jarvis-secondary/5 animate-pulse"></div>
          <div className="absolute w-5/6 h-5/6 rounded-full bg-jarvis-secondary/10 animate-pulse delay-100"></div>
          <div className="absolute w-4/6 h-4/6 rounded-full bg-jarvis-secondary/15 animate-pulse delay-200"></div>
        </>
      )}
      <div className={`absolute w-3/6 h-3/6 rounded-full flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-jarvis-accent' : 'bg-jarvis-secondary/30'}`}>
        <div className="text-white text-xl font-bold">J</div>
      </div>
    </div>
  );
};

export default WaveCircle;
