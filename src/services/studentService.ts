import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StudentIDValidationService } from './studentIDValidationService';

export interface StudentRecord {
  student_id: string; // PRIMARY KEY
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  enrolled_classes: string[]; // Array of class IDs
  created_at: string;
  updated_at: string;
  created_by: string;
  validation_status?: 'official' | 'unvalidated' | 'pending'; // Validation status
  validation_date?: string; // Date when record was marked official
  validated_by?: string; // Admin/user who validated the record
}

export interface StudentEnrollment {
  student_id: string; // PRIMARY KEY
  class_id: string;
  enrolled_date: string;
  status: 'active' | 'inactive' | 'dropped';
}

export interface StudentExamResult {
  result_id: string;
  student_id: string; // PRIMARY KEY for linking
  exam_id: string;
  score: number;
  total_questions: number;
  answers: string[];
  scanned_at: string;
  scanned_by: string;
  is_null_id: boolean;
}

const STUDENTS_COLLECTION = 'students';
const ENROLLMENTS_COLLECTION = 'studentEnrollments';
const EXAM_RESULTS_COLLECTION = 'studentExamResults';

export class StudentService {
  /**
   * Create a new student record with Student ID as primary key
   * @throws Error if student ID already exists or fails validation
   */
  static async createStudent(
    student_id: string,
    first_name: string,
    last_name: string,
    email: string | undefined,
    created_by: string
  ): Promise<StudentRecord> {
    // Validate student record
    const recordValidation = await StudentIDValidationService.validateStudentRecord(
      student_id,
      first_name,
      last_name
    );

    if (!recordValidation.isValid) {
      throw new Error(`Validation failed: ${recordValidation.errors.join('; ')}`);
    }

    // Validate student ID specifically
    const idValidation = await StudentIDValidationService.validateStudentId(student_id);
    if (!idValidation.isValid) {
      throw new Error(idValidation.error || 'Invalid student ID');
    }

    // Check if student already exists (prevent duplicates)
    try {
      const existingStudent = await this.getStudentById(student_id);
      if (existingStudent) {
        throw new Error(
          `Student ID "${student_id}" already exists in the system. ` +
          `Existing student: ${existingStudent.first_name} ${existingStudent.last_name} ` +
          `(created: ${new Date(existingStudent.created_at).toLocaleDateString()})`
        );
      }
    } catch (error) {
      // Re-throw if it's our custom duplicate error
      if ((error as Error).message.includes('already exists')) {
        throw error;
      }
      // Log other errors but continue
      console.error('Error checking for existing student:', error);
    }

    const now = new Date().toISOString();
    const studentRecord: StudentRecord = {
      student_id,
      first_name,
      last_name,
      email,
      enrolled_classes: [],
      created_at: now,
      updated_at: now,
      created_by,
    };

    try {
      // Use student_id as the document ID for efficient queries
      await setDoc(doc(db, STUDENTS_COLLECTION, student_id), {
        ...studentRecord,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      return studentRecord;
    } catch (error) {
      console.error(`Error creating student ${student_id}:`, error);
      throw new Error(`Failed to create student: ${(error as Error).message}`);
    }
  }

  /**
   * Get student record by Student ID (primary key lookup)
   */
  static async getStudentById(student_id: string): Promise<StudentRecord | null> {
    try {
      const docSnap = await getDoc(doc(db, STUDENTS_COLLECTION, student_id));
      return docSnap.exists() ? (docSnap.data() as StudentRecord) : null;
    } catch (error) {
      console.error(`Error fetching student ${student_id}:`, error);
      throw new Error(`Failed to fetch student: ${(error as Error).message}`);
    }
  }

  /**
   * Update student record
   */
  static async updateStudent(
    student_id: string,
    updates: Partial<StudentRecord>
  ): Promise<StudentRecord> {
    try {
      // Don't allow changing student_id (primary key)
      const { student_id: _, ...safeUpdates } = updates;

      const updateData = {
        ...safeUpdates,
        updated_at: serverTimestamp(),
      };

      await updateDoc(doc(db, STUDENTS_COLLECTION, student_id), updateData);

      // Return updated record
      const updated = await this.getStudentById(student_id);
      if (!updated) {
        throw new Error('Failed to retrieve updated student record');
      }
      return updated;
    } catch (error) {
      console.error(`Error updating student ${student_id}:`, error);
      throw new Error(`Failed to update student: ${(error as Error).message}`);
    }
  }

  /**
   * Delete student record and cascade delete related data
   */
  static async deleteStudent(student_id: string, userId: string): Promise<void> {
    const batch = writeBatch(db);

    try {
      // 1. Delete student record
      batch.delete(doc(db, STUDENTS_COLLECTION, student_id));

      // 2. Delete all enrollments for this student
      const enrollmentsQuery = query(
        collection(db, ENROLLMENTS_COLLECTION),
        where('student_id', '==', student_id)
      );
      const enrollmentDocs = await getDocs(enrollmentsQuery);
      enrollmentDocs.forEach((doc) => batch.delete(doc.ref));

      // 3. Delete all exam results for this student (soft delete by marking archived)
      const resultsQuery = query(
        collection(db, EXAM_RESULTS_COLLECTION),
        where('student_id', '==', student_id)
      );
      const resultDocs = await getDocs(resultsQuery);
      resultDocs.forEach((doc) => {
        batch.update(doc.ref, {
          archived: true,
          deleted_at: serverTimestamp(),
          deleted_by: userId,
        });
      });

      await batch.commit();
    } catch (error) {
      console.error(`Error deleting student ${student_id}:`, error);
      throw new Error(`Failed to delete student: ${(error as Error).message}`);
    }
  }

  /**
   * Enroll student in a class
   */
  static async enrollStudentInClass(
    student_id: string,
    class_id: string
  ): Promise<StudentEnrollment> {
    try {
      // Verify student exists
      const student = await this.getStudentById(student_id);
      if (!student) {
        throw new Error(`Student ${student_id} does not exist`);
      }

      // Check if already enrolled
      const existingEnrollment = await this.getEnrollment(student_id, class_id);
      if (existingEnrollment && existingEnrollment.status === 'active') {
        throw new Error(`Student ${student_id} is already enrolled in class ${class_id}`);
      }

      const now = new Date().toISOString();
      const enrollment_id = `${student_id}_${class_id}`;

      const enrollmentData: StudentEnrollment = {
        student_id,
        class_id,
        enrolled_date: now,
        status: 'active',
      };

      // Create enrollment record
      await setDoc(doc(db, ENROLLMENTS_COLLECTION, enrollment_id), {
        ...enrollmentData,
        enrolled_date: serverTimestamp(),
      });

      // Update student's enrolled_classes array
      await updateDoc(doc(db, STUDENTS_COLLECTION, student_id), {
        enrolled_classes: enrollment => {
          if (!enrollment) return [class_id];
          if (enrollment.includes(class_id)) return enrollment;
          return [...enrollment, class_id];
        },
        updated_at: serverTimestamp(),
      });

      return enrollmentData;
    } catch (error) {
      console.error(`Error enrolling student ${student_id} in class ${class_id}:`, error);
      throw new Error(`Failed to enroll student: ${(error as Error).message}`);
    }
  }

  /**
   * Get enrollment record
   */
  static async getEnrollment(
    student_id: string,
    class_id: string
  ): Promise<StudentEnrollment | null> {
    try {
      const enrollment_id = `${student_id}_${class_id}`;
      const docSnap = await getDoc(doc(db, ENROLLMENTS_COLLECTION, enrollment_id));
      return docSnap.exists() ? (docSnap.data() as StudentEnrollment) : null;
    } catch (error) {
      console.error(`Error fetching enrollment ${student_id}:${class_id}:`, error);
      return null;
    }
  }

  /**
   * Get all students enrolled in a class
   */
  static async getClassStudents(class_id: string): Promise<StudentRecord[]> {
    try {
      const enrollmentsQuery = query(
        collection(db, ENROLLMENTS_COLLECTION),
        where('class_id', '==', class_id),
        where('status', '==', 'active')
      );

      const enrollmentDocs = await getDocs(enrollmentsQuery);
      const studentIds = enrollmentDocs.docs.map(
        (doc) => (doc.data() as StudentEnrollment).student_id
      );

      const students: StudentRecord[] = [];
      for (const student_id of studentIds) {
        const student = await this.getStudentById(student_id);
        if (student) students.push(student);
      }

      return students;
    } catch (error) {
      console.error(`Error fetching class students for ${class_id}:`, error);
      return [];
    }
  }

  /**
   * Get all classes for a student
   */
  static async getStudentClasses(student_id: string): Promise<string[]> {
    try {
      const student = await this.getStudentById(student_id);
      return student?.enrolled_classes || [];
    } catch (error) {
      console.error(`Error fetching classes for student ${student_id}:`, error);
      return [];
    }
  }

  /**
   * Record exam result for student using student_id as foreign key
   */
  static async recordExamResult(
    exam_id: string,
    student_id: string,
    score: number,
    answers: string[],
    scanned_by: string,
    is_null_id: boolean = false
  ): Promise<StudentExamResult> {
    try {
      // Verify student exists
      const student = await this.getStudentById(student_id);
      if (!student) {
        throw new Error(`Student ${student_id} does not exist`);
      }

      const result_id = `result_${exam_id}_${student_id}_${Date.now()}`;
      const now = new Date().toISOString();

      const resultData: StudentExamResult = {
        result_id,
        student_id, // Foreign key reference
        exam_id,
        score,
        total_questions: answers.length,
        answers,
        scanned_at: now,
        scanned_by,
        is_null_id,
      };

      await setDoc(doc(db, EXAM_RESULTS_COLLECTION, result_id), {
        ...resultData,
        scanned_at: serverTimestamp(),
      });

      return resultData;
    } catch (error) {
      console.error(`Error recording exam result for student ${student_id}:`, error);
      throw new Error(`Failed to record exam result: ${(error as Error).message}`);
    }
  }

  /**
   * Get all exam results for a student
   */
  static async getStudentExamResults(student_id: string): Promise<StudentExamResult[]> {
    try {
      const resultsQuery = query(
        collection(db, EXAM_RESULTS_COLLECTION),
        where('student_id', '==', student_id)
      );

      const resultDocs = await getDocs(resultsQuery);
      return resultDocs.docs.map((doc) => doc.data() as StudentExamResult);
    } catch (error) {
      console.error(`Error fetching exam results for student ${student_id}:`, error);
      return [];
    }
  }

  /**
   * Validate student ID format and uniqueness
   */
  static async validateStudentId(student_id: string): Promise<{
    isValid: boolean;
    message?: string;
  }> {
    if (!student_id || !student_id.trim()) {
      return { isValid: false, message: 'Student ID cannot be empty' };
    }

    if (student_id.length < 3) {
      return { isValid: false, message: 'Student ID must be at least 3 characters' };
    }

    const existing = await this.getStudentById(student_id);
    if (existing) {
      return { isValid: false, message: `Student ID "${student_id}" already exists` };
    }

    return { isValid: true };
  }

  /**
   * Bulk create students (with duplicate checking)
   */
  static async bulkCreateStudents(
    students: Array<{
      student_id: string;
      first_name: string;
      last_name: string;
      email?: string;
    }>,
    created_by: string
  ): Promise<{ created: StudentRecord[]; errors: string[] }> {
    const created: StudentRecord[] = [];
    const errors: string[] = [];

    for (const student of students) {
      try {
        const result = await this.createStudent(
          student.student_id,
          student.first_name,
          student.last_name,
          student.email,
          created_by
        );
        created.push(result);
      } catch (error) {
        errors.push(`${student.student_id}: ${(error as Error).message}`);
      }
    }

    return { created, errors };
  }
}
