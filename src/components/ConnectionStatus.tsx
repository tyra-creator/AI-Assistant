import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { OAuthConnectionCard } from './OAuthConnectionCard';
import { Settings, Wifi, WifiOff } from 'lucide-react';

export const ConnectionStatus: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error",
        description: "Failed to load connection status",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const hasConnections = profile?.google_access_token || profile?.microsoft_access_token;

  if (loading) {
    return null;
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2"
      >
        {hasConnections ? (
          <Wifi className="h-4 w-4 text-green-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-amber-500" />
        )}
        <span className="hidden sm:inline">
          {hasConnections ? 'Connected' : 'Not Connected'}
        </span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <CardTitle>Account Connections</CardTitle>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  ✕
                </Button>
              </div>
              <CardDescription>
                Connect your calendar and email accounts to enable full functionality
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Connection Status</span>
                <Badge variant={hasConnections ? "default" : "secondary"}>
                  {hasConnections ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              
              <div className="space-y-4">
                <OAuthConnectionCard
                  provider="google"
                  isConnected={!!profile?.google_access_token}
                  userInfo={profile?.google_user_info}
                  onConnectionChange={fetchProfile}
                />
                
                <OAuthConnectionCard
                  provider="microsoft"
                  isConnected={!!profile?.microsoft_access_token}
                  userInfo={profile?.microsoft_user_info}
                  onConnectionChange={fetchProfile}
                />
              </div>

              {!hasConnections && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Note:</strong> You need to connect at least one account to use calendar and email features.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};