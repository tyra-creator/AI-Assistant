import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Mail, CheckCircle, AlertCircle } from 'lucide-react';

interface OAuthConnectionCardProps {
  provider: 'google' | 'microsoft';
  isConnected: boolean;
  userInfo?: any;
  onConnectionChange: () => void;
}

export const OAuthConnectionCard: React.FC<OAuthConnectionCardProps> = ({
  provider,
  isConnected,
  userInfo,
  onConnectionChange
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const providerConfig = {
    google: {
      name: 'Google',
      icon: Calendar,
      color: 'bg-blue-500',
      description: 'Connect Google Calendar and Gmail',
      scopes: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly'
    },
    microsoft: {
      name: 'Microsoft',
      icon: Mail,
      color: 'bg-orange-500',
      description: 'Connect Outlook Calendar and Email',
      scopes: 'openid email profile Calendars.ReadWrite Mail.Send Mail.Read offline_access'
    }
  };

  const config = providerConfig[provider];
  const Icon = config.icon;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === 'google' ? 'google' : 'azure',
        options: {
          scopes: config.scopes,
          redirectTo: `${window.location.origin}/app`
        }
      });

      if (error) throw error;
      
      toast({
        title: `Connecting to ${config.name}`,
        description: "You'll be redirected to authorize access..."
      });
    } catch (error) {
      console.error(`${config.name} OAuth error:`, error);
      toast({
        title: "Connection Failed",
        description: `Failed to connect to ${config.name}. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    // In a real implementation, you'd call an endpoint to revoke tokens
    toast({
      title: "Disconnect Feature",
      description: "This feature will be implemented to revoke OAuth tokens.",
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${config.color} text-white`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{config.name}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
          </div>
          {isConnected ? (
            <CheckCircle className="h-6 w-6 text-green-500" />
          ) : (
            <AlertCircle className="h-6 w-6 text-amber-500" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isConnected && userInfo ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Connected as: <span className="font-medium text-foreground">{userInfo.email}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleDisconnect}
              className="w-full"
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Connect your {config.name} account to enable calendar and email features.
            </div>
            <Button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? 'Connecting...' : `Connect ${config.name}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};