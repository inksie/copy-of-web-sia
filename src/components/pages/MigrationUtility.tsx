'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  runAllMigrations,
  migrateExistingUsers,
  migrateExamsToInstructorId,
  migrateClassesToInstructorId 
} from '@/services/migrationService';
import { Database, Users, FileText, BookOpen, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface MigrationLog {
  type: 'info' | 'success' | 'error';
  message: string;
  timestamp: Date;
}

export default function MigrationUtility() {
  const [logs, setLogs] = useState<MigrationLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addLog = (type: 'info' | 'success' | 'error', message: string) => {
    setLogs(prev => [...prev, { type, message, timestamp: new Date() }]);
  };

  const handleMigrateUsers = async () => {
    setIsRunning(true);
    addLog('info', 'Starting user migration...');
    
    try {
      const result = await migrateExistingUsers();
      
      if (result.success) {
        addLog('success', `✓ User migration complete! Migrated: ${result.migratedCount}, Skipped: ${result.skippedCount}`);
      } else {
        addLog('error', `✗ User migration had errors. Check console for details.`);
      }
      
      if (result.errors.length > 0) {
        result.errors.forEach(err => {
          addLog('error', `Error for user ${err.userId}: ${err.error}`);
        });
      }
    } catch (error: any) {
      addLog('error', `Fatal error: ${error.message}`);
    }
    
    setIsRunning(false);
  };

  const handleMigrateExams = async () => {
    setIsRunning(true);
    addLog('info', 'Starting exam migration...');
    
    try {
      const result = await migrateExamsToInstructorId();
      
      if (result.success) {
        addLog('success', `✓ Exam migration complete! Migrated: ${result.migratedCount}, Skipped: ${result.skippedCount}`);
      } else {
        addLog('error', `✗ Exam migration had errors. Check console for details.`);
      }
      
      if (result.errors.length > 0) {
        result.errors.forEach(err => {
          addLog('error', `Error for exam ${err.userId}: ${err.error}`);
        });
      }
    } catch (error: any) {
      addLog('error', `Fatal error: ${error.message}`);
    }
    
    setIsRunning(false);
  };

  const handleMigrateClasses = async () => {
    setIsRunning(true);
    addLog('info', 'Starting class migration...');
    
    try {
      const result = await migrateClassesToInstructorId();
      
      if (result.success) {
        addLog('success', `✓ Class migration complete! Migrated: ${result.migratedCount}, Skipped: ${result.skippedCount}`);
      } else {
        addLog('error', `✗ Class migration had errors. Check console for details.`);
      }
      
      if (result.errors.length > 0) {
        result.errors.forEach(err => {
          addLog('error', `Error for class ${err.userId}: ${err.error}`);
        });
      }
    } catch (error: any) {
      addLog('error', `Fatal error: ${error.message}`);
    }
    
    setIsRunning(false);
  };

  const handleRunAll = async () => {
    setIsRunning(true);
    addLog('info', 'Starting full migration (users, exams, and classes)...');
    
    try {
      await runAllMigrations();
      addLog('success', '✓ All migrations complete! Check console for detailed results.');
    } catch (error: any) {
      addLog('error', `Fatal error during full migration: ${error.message}`);
    }
    
    setIsRunning(false);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Instructor ID Migration Utility</h1>
        <p className="text-muted-foreground mt-1">
          Use these tools to migrate existing users, exams, and classes to use instructor IDs.
        </p>
      </div>

      {/* Warning Card */}
      <Card className="p-6 border-yellow-300 bg-yellow-50">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-900">Important Notes</h3>
            <ul className="text-sm text-yellow-800 mt-2 space-y-1 list-disc list-inside">
              <li>Run migrations only once for existing data</li>
              <li>New users automatically get instructor IDs during signup</li>
              <li>Existing data will continue to work without migration</li>
              <li>Migration is optional but recommended for consistency</li>
              <li>Check browser console for detailed logs</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Migration Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Migrate Users</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Assign instructor IDs to existing users who don't have one yet.
          </p>
          <Button
            onClick={handleMigrateUsers}
            disabled={isRunning}
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              'Migrate Users'
            )}
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Migrate Exams</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Add instructor IDs to existing exams based on their creator.
          </p>
          <Button
            onClick={handleMigrateExams}
            disabled={isRunning}
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              'Migrate Exams'
            )}
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Migrate Classes</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Add instructor IDs to existing classes based on their creator.
          </p>
          <Button
            onClick={handleMigrateClasses}
            disabled={isRunning}
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              'Migrate Classes'
            )}
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <Database className="w-5 h-5 text-orange-600" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Run All Migrations</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Run all migrations in sequence (users, exams, and classes).
          </p>
          <Button
            onClick={handleRunAll}
            disabled={isRunning}
            variant="destructive"
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              'Run All Migrations'
            )}
          </Button>
        </Card>
      </div>

      {/* Logs */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Migration Logs</h2>
          {logs.length > 0 && (
            <Button
              onClick={clearLogs}
              variant="outline"
              size="sm"
            >
              Clear Logs
            </Button>
          )}
        </div>
        
        <div className="space-y-2 max-h-96 overflow-y-auto bg-muted/30 rounded-lg p-4">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No logs yet. Run a migration to see results here.
            </p>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 text-sm p-2 rounded ${
                  log.type === 'success' ? 'bg-green-50' :
                  log.type === 'error' ? 'bg-red-50' :
                  'bg-blue-50'
                }`}
              >
                {log.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                ) : log.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className={
                    log.type === 'success' ? 'text-green-800' :
                    log.type === 'error' ? 'text-red-800' :
                    'text-blue-800'
                  }>
                    {log.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {log.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
