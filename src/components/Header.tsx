
import React, { useState } from 'react';
import { Clock, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const Header: React.FC = () => {
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [isAvatarHovered, setIsAvatarHovered] = useState(false);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const formattedTime = currentTime.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit'
  });

  const formattedDate = currentTime.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  const handleAvatarClick = () => {
    alert("Hello! I'm your Executive Assistant. How can I help you today?");
  };

  return (
    <header className="w-full py-4 px-6 flex justify-between items-center border-b border-primary/30">
      <div className="flex items-center">
        <div 
          className={`relative cursor-pointer transition-all duration-300 ${isAvatarHovered ? 'scale-110' : ''}`}
          onClick={handleAvatarClick}
          onMouseEnter={() => setIsAvatarHovered(true)}
          onMouseLeave={() => setIsAvatarHovered(false)}
        >
          <Avatar className="h-10 w-10 bg-secondary">
            <AvatarFallback className="text-white font-bold">
              <svg 
                viewBox="0 0 100 100" 
                className="h-full w-full p-0.5"
                fill="currentColor"
              >
                <path d="M50,10 C60,10 70,20 70,35 C70,50 60,55 50,55 C40,55 30,50 30,35 C30,20 40,10 50,10 Z" />
                <path d="M30,60 C30,60 25,62 25,65 C25,68 25,90 25,90 L75,90 C75,90 75,68 75,65 C75,62 70,60 70,60 C70,60 65,57 50,57 C35,57 30,60 30,60 Z" />
              </svg>
            </AvatarFallback>
          </Avatar>
          {isAvatarHovered && (
            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-secondary rounded-full animate-pulse" />
          )}
        </div>
        <div className="ml-3 flex items-center space-x-2">
          <img 
            src="/lovable-uploads/8b5a042e-24ee-4b55-95cb-5f7ec253c6ea.png" 
            alt="VirtuAI Assistant Icon" 
            className="h-6 w-6"
          />
          <h1 className="text-xl font-montserrat font-bold text-foreground">VirtuAI Assistant</h1>
        </div>
      </div>
      <div className="flex items-center text-muted-foreground">
        <Clock className="h-4 w-4 mr-2" />
        <span className="mr-2">{formattedTime}</span>
        <span className="hidden md:inline">| {formattedDate}</span>
      </div>
    </header>
  );
};

export default Header;
