/**
 * Migration Utility for Existing Users
 * 
 * This utility assigns instructor IDs to existing users who created accounts
 * before the instructor ID system was implemented.
 * 
 * Usage:
 * 1. Make sure you're authenticated as an admin
 * 2. Import and call migrateExistingUsers()
 * 3. This will assign instructor IDs to all users without one
 */

import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createInstructorProfile, getInstructorProfileByUserId } from './instructorService';

interface MigrationResult {
  success: boolean;
  migratedCount: number;
  skippedCount: number;
  errors: Array<{ userId: string; error: string }>;
}

/**
 * Migrate existing users to have instructor IDs
 */
export async function migrateExistingUsers(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    console.log('Starting user migration...');
    
    // Get all users from Firestore
    const usersSnapshot = await getDocs(collection(db, 'users'));
    
    console.log(`Found ${usersSnapshot.docs.length} users to process`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      try {
        // Check if user already has an instructorId
        if (userData.instructorId) {
          console.log(`User ${userId} already has instructor ID: ${userData.instructorId}`);
          result.skippedCount++;
          continue;
        }
        
        // Check if instructor profile already exists
        const existingProfile = await getInstructorProfileByUserId(userId);
        
        if (existingProfile) {
          console.log(`Instructor profile exists for user ${userId}: ${existingProfile.instructorId}`);
          
          // Update user document with existing instructorId
          await setDoc(doc(db, 'users', userId), {
            instructorId: existingProfile.instructorId,
          }, { merge: true });
          
          result.skippedCount++;
          continue;
        }
        
        // Create new instructor profile
        console.log(`Creating instructor profile for user ${userId}...`);
        const newProfile = await createInstructorProfile(
          userId,
          userData.email || '',
          userData.fullName || userData.displayName || 'Unknown'
        );
        
        console.log(`Created instructor ID ${newProfile.instructorId} for user ${userId}`);
        
        // Update user document with instructorId
        await setDoc(doc(db, 'users', userId), {
          instructorId: newProfile.instructorId,
        }, { merge: true });
        
        result.migratedCount++;
        console.log(`✓ Migrated user ${userId} with instructor ID ${newProfile.instructorId}`);
        
      } catch (error: any) {
        console.error(`Error migrating user ${userId}:`, error);
        result.errors.push({
          userId,
          error: error.message || 'Unknown error',
        });
        result.success = false;
      }
    }
    
    console.log('\n=== Migration Complete ===');
    console.log(`Migrated: ${result.migratedCount}`);
    console.log(`Skipped: ${result.skippedCount}`);
    console.log(`Errors: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(err => {
        console.log(`- User ${err.userId}: ${err.error}`);
      });
    }
    
    return result;
    
  } catch (error: any) {
    console.error('Fatal error during migration:', error);
    result.success = false;
    result.errors.push({
      userId: 'SYSTEM',
      error: error.message || 'Unknown error',
    });
    return result;
  }
}

/**
 * Update existing exams to include instructorId based on createdBy
 */
export async function migrateExamsToInstructorId(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    console.log('Starting exam migration...');
    
    // Get all exams
    const examsSnapshot = await getDocs(collection(db, 'exams'));
    
    console.log(`Found ${examsSnapshot.docs.length} exams to process`);
    
    for (const examDoc of examsSnapshot.docs) {
      const examData = examDoc.data();
      const examId = examDoc.id;
      
      try {
        // Skip if already has instructorId
        if (examData.instructorId) {
          result.skippedCount++;
          continue;
        }
        
        // Get instructor profile by createdBy userId
        const userId = examData.createdBy;
        if (!userId) {
          console.warn(`Exam ${examId} has no createdBy field, skipping`);
          result.skippedCount++;
          continue;
        }
        
        const instructorProfile = await getInstructorProfileByUserId(userId);
        
        if (!instructorProfile) {
          console.warn(`No instructor profile found for user ${userId}, skipping exam ${examId}`);
          result.skippedCount++;
          continue;
        }
        
        // Update exam with instructorId
        await setDoc(doc(db, 'exams', examId), {
          instructorId: instructorProfile.instructorId,
        }, { merge: true });
        
        result.migratedCount++;
        console.log(`✓ Migrated exam ${examId} with instructor ID ${instructorProfile.instructorId}`);
        
      } catch (error: any) {
        console.error(`Error migrating exam ${examId}:`, error);
        result.errors.push({
          userId: examId,
          error: error.message || 'Unknown error',
        });
      }
    }
    
    console.log('\n=== Exam Migration Complete ===');
    console.log(`Migrated: ${result.migratedCount}`);
    console.log(`Skipped: ${result.skippedCount}`);
    console.log(`Errors: ${result.errors.length}`);
    
    return result;
    
  } catch (error: any) {
    console.error('Fatal error during exam migration:', error);
    result.success = false;
    return result;
  }
}

/**
 * Update existing classes to include instructorId based on createdBy
 */
export async function migrateClassesToInstructorId(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    console.log('Starting class migration...');
    
    // Get all classes
    const classesSnapshot = await getDocs(collection(db, 'classes'));
    
    console.log(`Found ${classesSnapshot.docs.length} classes to process`);
    
    for (const classDoc of classesSnapshot.docs) {
      const classData = classDoc.data();
      const classId = classDoc.id;
      
      try {
        // Skip if already has instructorId
        if (classData.instructorId) {
          result.skippedCount++;
          continue;
        }
        
        // Get instructor profile by createdBy userId
        const userId = classData.createdBy;
        if (!userId) {
          console.warn(`Class ${classId} has no createdBy field, skipping`);
          result.skippedCount++;
          continue;
        }
        
        const instructorProfile = await getInstructorProfileByUserId(userId);
        
        if (!instructorProfile) {
          console.warn(`No instructor profile found for user ${userId}, skipping class ${classId}`);
          result.skippedCount++;
          continue;
        }
        
        // Update class with instructorId
        await setDoc(doc(db, 'classes', classId), {
          instructorId: instructorProfile.instructorId,
        }, { merge: true });
        
        result.migratedCount++;
        console.log(`✓ Migrated class ${classId} with instructor ID ${instructorProfile.instructorId}`);
        
      } catch (error: any) {
        console.error(`Error migrating class ${classId}:`, error);
        result.errors.push({
          userId: classId,
          error: error.message || 'Unknown error',
        });
      }
    }
    
    console.log('\n=== Class Migration Complete ===');
    console.log(`Migrated: ${result.migratedCount}`);
    console.log(`Skipped: ${result.skippedCount}`);
    console.log(`Errors: ${result.errors.length}`);
    
    return result;
    
  } catch (error: any) {
    console.error('Fatal error during class migration:', error);
    result.success = false;
    return result;
  }
}

/**
 * Run all migrations
 */
export async function runAllMigrations(): Promise<void> {
  console.log('=== Starting Full Migration ===\n');
  
  // 1. Migrate users first
  const userResult = await migrateExistingUsers();
  
  // 2. Migrate exams
  const examResult = await migrateExamsToInstructorId();
  
  // 3. Migrate classes
  const classResult = await migrateClassesToInstructorId();
  
  console.log('\n=== All Migrations Complete ===');
  console.log(`Users - Migrated: ${userResult.migratedCount}, Skipped: ${userResult.skippedCount}, Errors: ${userResult.errors.length}`);
  console.log(`Exams - Migrated: ${examResult.migratedCount}, Skipped: ${examResult.skippedCount}, Errors: ${examResult.errors.length}`);
  console.log(`Classes - Migrated: ${classResult.migratedCount}, Skipped: ${classResult.skippedCount}, Errors: ${classResult.errors.length}`);
}
