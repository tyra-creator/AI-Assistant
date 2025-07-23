import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

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
    // Simulate success
    alert('Logged in!');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">Log In</h2>
        <div className="mb-4">
          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="mb-4">
          <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <Button type="submit" className="w-full">Log In</Button>
        <div className="mt-4 text-center">
          Don't have an account? <a href="/signup" className="text-blue-600">Sign Up</a>
        </div>
      </form>
    </div>
  );
}
