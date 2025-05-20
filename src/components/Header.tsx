
import React from 'react';
import { Clock } from 'lucide-react';

const Header: React.FC = () => {
  const [currentTime, setCurrentTime] = React.useState(new Date());

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

  return (
    <header className="w-full py-4 px-6 flex justify-between items-center border-b border-primary/30">
      <div className="flex items-center">
        <div className="h-8 w-8 bg-accent rounded-full flex items-center justify-center mr-3">
          <span className="text-white font-bold">A</span>
        </div>
        <h1 className="text-xl font-bold text-foreground">ASSISTANT</h1>
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
