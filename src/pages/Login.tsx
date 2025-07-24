import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Separator } from '../components/ui/separator';
import { Link } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // TODO: Connect to backend API for authentication
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    // Simulate success - redirect to main app
    window.location.href = '/app';
  };

  const handleGoogleLogin = () => {
    // TODO: Implement Google OAuth
    alert('Google sign in coming soon!');
  };

  const handleMicrosoftLogin = () => {
    // TODO: Implement Microsoft OAuth
    alert('Microsoft sign in coming soon!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center space-x-3 mb-6">
            <img 
              src="/lovable-uploads/059ad0dd-de4f-441d-9d82-e61c507b3136.png" 
              alt="VirtuAI Assistant Icon" 
              className="h-10 w-10"
            />
            <span className="text-xl font-montserrat font-bold text-foreground">VirtuAI Assistant</span>
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">Welcome back</h1>
          <p className="text-muted-foreground">Sign in to your VirtuAI Assistant account</p>
        </div>

        <div className="bg-card p-8 rounded-2xl shadow-lg border">
          {/* Social Login Buttons */}
          <div className="space-y-3 mb-6">
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={handleGoogleLogin}
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={handleMicrosoftLogin}
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="currentColor" d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
              </svg>
              Continue with Microsoft
            </Button>
          </div>

          <div className="relative">
            <Separator />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-card px-2 text-muted-foreground text-sm">or</span>
            </div>
          </div>

          {/* Email Login Form */}
          <form onSubmit={handleLogin} className="mt-6">
            <div className="space-y-4">
              <div>
                <Input 
                  type="email" 
                  placeholder="Email address" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)}
                  className="h-12"
                />
              </div>
              <div>
                <Input 
                  type="password" 
                  placeholder="Password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  className="h-12"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-4">
              <label className="flex items-center space-x-2 text-sm">
                <input type="checkbox" className="rounded" />
                <span className="text-muted-foreground">Remember me</span>
              </label>
              <a href="#" className="text-sm text-primary hover:underline">
                Forgot password?
              </a>
            </div>
            
            {error && (
              <div className="text-destructive text-sm mt-4 p-3 bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            
            <Button type="submit" className="w-full mt-6 h-12">
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-muted-foreground">Don't have an account? </span>
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
