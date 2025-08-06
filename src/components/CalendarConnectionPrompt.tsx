import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Wifi } from 'lucide-react';

interface CalendarConnectionPromptProps {
  onConnectClick: () => void;
}

export const CalendarConnectionPrompt: React.FC<CalendarConnectionPromptProps> = ({ onConnectClick }) => {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Calendar className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Connect Your Calendar</CardTitle>
        <CardDescription>
          Connect your Google or Microsoft account to enable calendar features and AI assistance.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <Button onClick={onConnectClick} className="w-full">
          <Wifi className="mr-2 h-4 w-4" />
          Connect Account
        </Button>
      </CardContent>
    </Card>
  );
};