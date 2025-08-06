import React from 'react';
import { Calendar, MessageCircle, Clock } from 'lucide-react';
import { ConnectionStatus } from './ConnectionStatus';

const Header = () => {
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
    <header className="w-full py-6 px-8 border-b border-primary/20 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-xl">
            <MessageCircle className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-montserrat font-bold text-foreground">
              Business Assistant
            </h1>
            <p className="text-sm text-muted-foreground">AI-powered productivity companion</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <ConnectionStatus />
          <div className="flex items-center space-x-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{formattedTime}</span>
            <span className="hidden md:inline text-sm">| {formattedDate}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
export default Header;