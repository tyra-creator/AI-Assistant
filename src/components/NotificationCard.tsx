
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Calendar } from "lucide-react";

export interface EventNotification {
  id: string;
  title: string;
  datetime: string;
  description?: string;
}

interface NotificationCardProps {
  notification: EventNotification;
}

const NotificationCard: React.FC<NotificationCardProps> = ({ notification }) => {
  const formattedDate = new Date(notification.datetime).toLocaleString();

  return (
    <Card className="w-full bg-jarvis-primary/10 border-jarvis-secondary/20 shadow-md mb-3 overflow-hidden">
      <div className="absolute top-0 left-0 h-full w-1 bg-jarvis-accent"></div>
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-jarvis-accent" />
          <span>{notification.title}</span>
        </CardTitle>
        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-jarvis-accent/10">
          <Bell className="h-3 w-3 text-jarvis-accent" />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <p className="text-xs text-jarvis-text-muted mb-1">{formattedDate}</p>
        {notification.description && (
          <p className="text-sm text-jarvis-text">{notification.description}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationCard;
