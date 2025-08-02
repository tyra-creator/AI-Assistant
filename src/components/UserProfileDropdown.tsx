import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Settings, 
  CreditCard, 
  HelpCircle, 
  LogOut,
  ChevronUp 
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export const UserProfileDropdown = () => {
  const { user, profile, getDisplayName, getInitials, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const { error } = await signOut();
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
      setIsLoggingOut(false);
    } else {
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
      navigate('/login');
    }
  };

  const handleProfileClick = () => {
    navigate('/user-preferences');
  };

  const handleUpgradeClick = () => {
    navigate('/payment-details');
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full justify-start p-3 h-auto hover:bg-accent/10 border border-primary/20 bg-card/50 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3 w-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-foreground truncate">
                {getDisplayName()}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {user.email}
              </div>
            </div>
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="start" 
        side="top" 
        className="w-64 bg-popover border-primary/20 shadow-lg"
        sideOffset={8}
      >
        <div className="px-3 py-2">
          <div className="text-sm font-medium text-foreground">
            {getDisplayName()}
          </div>
          <div className="text-xs text-muted-foreground">
            {user.email}
          </div>
        </div>
        
        <DropdownMenuSeparator className="bg-primary/20" />
        
        <DropdownMenuItem 
          onClick={handleProfileClick}
          className="cursor-pointer hover:bg-accent/10"
        >
          <User className="h-4 w-4 mr-3" />
          Profile & Settings
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={handleUpgradeClick}
          className="cursor-pointer hover:bg-accent/10"
        >
          <CreditCard className="h-4 w-4 mr-3" />
          Upgrade Plan
        </DropdownMenuItem>
        
        <DropdownMenuItem className="cursor-pointer hover:bg-accent/10">
          <HelpCircle className="h-4 w-4 mr-3" />
          Help & Support
        </DropdownMenuItem>
        
        <DropdownMenuSeparator className="bg-primary/20" />
        
        <DropdownMenuItem 
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="cursor-pointer hover:bg-destructive/10 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4 mr-3" />
          {isLoggingOut ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};