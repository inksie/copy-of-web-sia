'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export default function ClearCachePage() {
  const { user, signOut } = useAuth();
  const [message, setMessage] = useState('');

  const handleClearCache = async () => {
    try {
      // Clear all auth-related localStorage
      localStorage.removeItem('auth_session');
      localStorage.removeItem('userCache');
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      setMessage('✅ Cache cleared! Logging out and redirecting...');
      
      // Sign out and redirect
      setTimeout(async () => {
        await signOut();
        window.location.href = '/auth';
      }, 1500);
      
    } catch (error: any) {
      setMessage(`❌ Error: ${error.message}`);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Clear Cache & Reload</h1>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Current User Info</h2>
        
        {user ? (
          <div className="space-y-2">
            <div><strong>User ID:</strong> {user.id}</div>
            <div><strong>Email:</strong> {user.email}</div>
            <div><strong>Instructor ID:</strong> {user.instructorId || '❌ NOT SET'}</div>
          </div>
        ) : (
          <p>Not logged in</p>
        )}
      </Card>

      <Card className="p-6 border-blue-300 bg-blue-50">
        <h3 className="font-bold text-blue-900 mb-2">Clear Cache & Reload User Data</h3>
        <p className="text-sm text-blue-800 mb-4">
          This will clear all cached user data, log you out, and force a fresh login. 
          After logging back in, your instructor ID will be loaded from Firestore.
        </p>
        
        <Button 
          onClick={handleClearCache}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear Cache & Logout
        </Button>

        {message && (
          <div className="mt-4 p-3 bg-white rounded border">
            <p className="text-sm">{message}</p>
          </div>
        )}
      </Card>

      <Card className="p-6 mt-6">
        <h3 className="font-bold mb-2">Instructions:</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Click "Clear Cache & Logout" above</li>
          <li>You'll be redirected to the login page</li>
          <li>Log back in with your credentials</li>
          <li>Your instructor ID should now load properly</li>
          <li>Try creating a class again</li>
        </ol>
      </Card>
    </div>
  );
}
