'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { createInstructorProfile } from '@/services/instructorService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function DiagnosticsPage() {
  const { user, firebaseUser } = useAuth();
  const [fixing, setFixing] = useState(false);
  const [message, setMessage] = useState('');

  const handleFixInstructorId = async () => {
    if (!user || !firebaseUser) {
      setMessage('❌ No user logged in');
      return;
    }

    setFixing(true);
    setMessage('🔄 Creating instructor profile...');

    try {
      // Create instructor profile
      const profile = await createInstructorProfile(
        user.id,
        user.email,
        user.displayName || 'Unknown'
      );

      setMessage(`✅ Instructor profile created: ${profile.instructorId}`);

      // Update user document
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        instructorId: profile.instructorId
      });

      setMessage(`✅ User document updated with instructor ID: ${profile.instructorId}. Please refresh the page.`);
      
      // Reload page after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error: any) {
      console.error('Error fixing instructor ID:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">User Diagnostics</h1>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Current User Information</h2>
        
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <strong>Logged In:</strong>
            {user ? (
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                Yes
              </span>
            ) : (
              <span className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                No
              </span>
            )}
          </div>

          {user && (
            <>
              <div>
                <strong>User ID:</strong> <code className="ml-2 text-sm bg-gray-100 px-2 py-1 rounded">{user.id}</code>
              </div>
              
              <div>
                <strong>Email:</strong> <span className="ml-2">{user.email}</span>
              </div>
              
              <div>
                <strong>Display Name:</strong> <span className="ml-2">{user.displayName || 'Not set'}</span>
              </div>
              
              <div>
                <strong>Role:</strong> <span className="ml-2">{user.role}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <strong>Instructor ID:</strong>
                {user.instructorId ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <code className="text-sm bg-green-100 px-2 py-1 rounded font-mono">
                      {user.instructorId}
                    </code>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <strong>NOT SET</strong>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {user && !user.instructorId && (
        <Card className="p-6 border-yellow-300 bg-yellow-50">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-yellow-600 mt-1" />
            <div>
              <h3 className="font-bold text-yellow-900 mb-2">Instructor ID Missing</h3>
              <p className="text-sm text-yellow-800 mb-4">
                Your account doesn't have an instructor ID assigned. This is required to create exams and classes.
                Click the button below to automatically create one.
              </p>
              
              <Button 
                onClick={handleFixInstructorId}
                disabled={fixing}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                {fixing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Fixing...
                  </>
                ) : (
                  'Fix Instructor ID'
                )}
              </Button>

              {message && (
                <div className="mt-4 p-3 bg-white rounded border">
                  <p className="text-sm">{message}</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {user && user.instructorId && (
        <Card className="p-6 border-green-300 bg-green-50">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-1" />
            <div>
              <h3 className="font-bold text-green-900 mb-2">Everything Looks Good!</h3>
              <p className="text-sm text-green-800">
                Your account is properly configured with an instructor ID. You can create exams and classes.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 mt-6">
        <h2 className="text-xl font-bold mb-4">Debug Information</h2>
        <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto">
          {JSON.stringify({ user, firebaseUser: firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email } : null }, null, 2)}
        </pre>
      </Card>
    </div>
  );
}
