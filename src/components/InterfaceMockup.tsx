import React from 'react';
import { Calendar, Mail, MessageCircle, CheckCircle, Clock, Users } from 'lucide-react';

export const InterfaceMockup = () => {
  return (
    <div className="relative">
      {/* Browser Window Frame */}
      <div className="bg-card border rounded-2xl shadow-2xl overflow-hidden max-w-2xl">
        {/* Browser Header */}
        <div className="bg-muted/50 px-4 py-3 border-b flex items-center space-x-2">
          <div className="flex space-x-1">
            <div className="w-3 h-3 bg-destructive rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-background rounded-md px-3 py-1 text-xs text-muted-foreground">
              app.virtuai.com
            </div>
          </div>
        </div>

        {/* Interface Content */}
        <div className="bg-background">
          {/* Navigation Tabs */}
          <div className="flex border-b">
            <div className="px-4 py-3 bg-primary/10 text-primary border-b-2 border-primary text-sm font-medium">
              Inbox
            </div>
            <div className="px-4 py-3 text-muted-foreground text-sm hover:text-foreground transition-colors">
              Calendar
            </div>
            <div className="px-4 py-3 text-muted-foreground text-sm hover:text-foreground transition-colors">
              WhatsApp
            </div>
          </div>

          {/* Main Content Area */}
          <div className="p-6 space-y-4">
            {/* AI Chat Conversation */}
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <MessageCircle className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1 bg-muted/50 rounded-lg p-3">
                  <p className="text-sm text-foreground">
                    I've rescheduled your 3 PM meeting with Sarah to tomorrow at 10 AM and sent her a calendar invite. Also drafted your response to the Johnson project proposal.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 justify-end">
                <div className="bg-primary rounded-lg p-3 max-w-xs">
                  <p className="text-sm text-primary-foreground">
                    Perfect! Can you also book dinner with the team for Friday?
                  </p>
                </div>
                <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                  <Users className="h-4 w-4 text-accent-foreground" />
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1 bg-muted/50 rounded-lg p-3">
                  <p className="text-sm text-foreground">
                    Done! I found a great Italian place and booked a table for 6 at 7 PM on Friday. Sent calendar invites to the whole team.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center space-x-2 p-2 bg-accent/10 rounded-lg">
                  <Mail className="h-4 w-4 text-accent" />
                  <span className="text-xs text-muted-foreground">3 emails</span>
                </div>
                <div className="flex items-center space-x-2 p-2 bg-primary/10 rounded-lg">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">2 meetings</span>
                </div>
                <div className="flex items-center space-x-2 p-2 bg-green-500/10 rounded-lg">
                  <Clock className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-muted-foreground">On time</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Indicators */}
      <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full animate-pulse"></div>
      <div className="absolute -bottom-4 -left-4 w-4 h-4 bg-primary rounded-full animate-pulse delay-1000"></div>
    </div>
  );
};