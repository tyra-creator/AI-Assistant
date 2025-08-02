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
  return <header className="w-full py-4 px-6 flex justify-between items-center border-b border-primary/30">
      <div className="flex items-center gap-3">
        <img src="/lovable-uploads/059ad0dd-de4f-441d-9d82-e61c507b3136.png" alt="VirtuAI Assistant Icon" className="h-12 w-12" />
        <h1 className="font-montserrat font-bold text-foreground text-xl">
          VirtuAI Assistant
        </h1>
      </div>
      <div className="flex items-center text-muted-foreground">
        <Clock className="h-4 w-4 mr-2" />
        <span className="mr-2">{formattedTime}</span>
        <span className="hidden md:inline">| {formattedDate}</span>
      </div>
    </header>;
};
export default Header;