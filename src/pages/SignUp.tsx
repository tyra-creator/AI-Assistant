import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // TODO: Connect to backend API for registration
    if (!email || !password || !name) {
      setError('All fields are required.');
      return;
    }
    // Simulate success
    alert('Account created! You can now log in.');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <form onSubmit={handleSignUp} className="bg-white p-8 rounded shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">Sign Up</h2>
        <div className="mb-4">
          <Input type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="mb-4">
          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="mb-4">
          <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <Button type="submit" className="w-full">Sign Up</Button>
        <div className="mt-4 text-center">
          Already have an account? <a href="/login" className="text-blue-600">Log In</a>
        </div>
      </form>
    </div>
  );
}
