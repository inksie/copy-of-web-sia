import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Exam {
  id: string;
  title: string;
  subject: string;
  num_items: number;
  choices_per_item: number;
  student_id_length?: number;
  created_at: string;
  answer_keys: string[];
  generated_sheets: GeneratedSheet[];
  createdBy?: string;
  updatedAt?: string;
  className?: string;
  examType?: 'board' | 'diagnostic';
  choicePoints?: { [choice: string]: number };
}

export interface GeneratedSheet {
  id: string;
  sheet_count: number;
  created_at: string;
}

export interface ExamFormData {
  name: string;
  totalQuestions: number;
  date: string;
  folder: string;
  className?: string;
  classId?: string;
  choicesPerItem?: number;
  examType?: 'board' | 'diagnostic';
  choicePoints?: { [choice: string]: number };
}

/**
 * Create a new exam in Firestore
 */
export async function createExam(
  formData: ExamFormData,
  userId: string,
): Promise<Exam> {
  try {
    const examData = {
      title: formData.name,
      subject: formData.folder,
      num_items: formData.totalQuestions,
      choices_per_item: formData.choicesPerItem || 4,
      created_at: formData.date,
      answer_keys: [],
      generated_sheets: [],
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      className: formData.className || null,
      classId: formData.classId || null,
      examType: formData.examType || 'board',
      choicePoints: formData.choicePoints || {},
    };
    const docRef = await addDoc(collection(db, "exams"), examData);

    // Return the exam with the generated ID
    const newExam: Exam = {
      id: docRef.id,
      title: examData.title,
      subject: examData.subject,
      num_items: examData.num_items,
      choices_per_item: examData.choices_per_item,
      created_at: examData.created_at,
      answer_keys: examData.answer_keys,
      generated_sheets: examData.generated_sheets,
      createdBy: userId,
      updatedAt: new Date().toISOString(),
      className: examData.className || undefined,
      examType: examData.examType || 'board',
      choicePoints: examData.choicePoints,
    };

    return newExam;
  } catch (error) {
    console.error("Error creating exam:", error);
    throw new Error("Failed to create exam");
  }
}

/**
 * Get recent exams for a user (lightweight - for dashboard)
 * Uses client-side filtering to avoid composite index requirement
 */
export async function getRecentExams(userId: string, limit: number = 5): Promise<Exam[]> {
  try {
    // Fetch all exams without filters to avoid composite index
    const q = query(collection(db, "exams"));
    const querySnapshot = await getDocs(q);
    const exams: Exam[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Filter by userId on client-side
      if (data.createdBy === userId) {
        exams.push({
          id: doc.id,
          title: data.title,
          subject: data.subject,
          num_items: data.num_items,
          choices_per_item: data.choices_per_item,
          created_at:
            data.created_at ||
            data.createdAt?.toDate?.().toISOString() ||
            new Date().toISOString(),
          answer_keys: data.answer_keys || [],
          generated_sheets: data.generated_sheets || [],
          createdBy: data.createdBy,
          updatedAt:
            data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
          className: data.className || undefined,
        });
      }
    });

    // Sort and limit
    exams.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.created_at).getTime();
      const dateB = new Date(b.updatedAt || b.created_at).getTime();
      return dateB - dateA;
    });

    return exams.slice(0, limit);
  } catch (error: any) {
    console.error("Error fetching recent exams:", error);
    return [];
  }
}

/**
 * Get exam count for a user (lightweight)
 * Uses client-side filtering to avoid composite index requirement
 */
export async function getExamCount(userId: string): Promise<number> {
  try {
    // Fetch all exams without filters to avoid composite index
    const q = query(collection(db, "exams"));
    const querySnapshot = await getDocs(q);
    let count = 0;

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Filter by userId on client-side
      if (data.createdBy === userId) {
        count++;
      }
    });

    return count;
  } catch (error: any) {
    console.error("Error fetching exam count:", error);
    return 0;
  }
}

/**
 * Get all exams for a user
 */
export async function getExams(userId?: string): Promise<Exam[]> {
  try {
    // Fetch all exams without filters to avoid composite index requirement
    const q = query(collection(db, "exams"));
    const querySnapshot = await getDocs(q);
    const exams: Exam[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Filter by userId if provided (client-side)
      if (!userId || data.createdBy === userId) {
        exams.push({
          id: doc.id,
          title: data.title,
          subject: data.subject,
          num_items: data.num_items,
          choices_per_item: data.choices_per_item,
          created_at:
            data.created_at ||
            data.createdAt?.toDate?.().toISOString() ||
            new Date().toISOString(),
          answer_keys: data.answer_keys || [],
          generated_sheets: data.generated_sheets || [],
          createdBy: data.createdBy,
          updatedAt:
            data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
          className: data.className || undefined,
        });
      }
    });

    // Sort in JavaScript after fetching
    exams.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.created_at).getTime();
      const dateB = new Date(b.updatedAt || b.created_at).getTime();
      return dateB - dateA;
    });

    return exams;
  } catch (error: any) {
    console.error("Error fetching exams:", error);
    throw new Error("Failed to fetch exams");
  }
}

/**
 * Get a single exam by ID
 */
export async function getExamById(examId: string): Promise<Exam | null> {
  try {
    const docRef = doc(db, "exams", examId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      title: data.title,
      subject: data.subject,
      num_items: data.num_items,
      choices_per_item: data.choices_per_item,
      created_at:
        data.created_at ||
        data.createdAt?.toDate?.().toISOString() ||
        new Date().toISOString(),
      answer_keys: data.answer_keys || [],
      generated_sheets: data.generated_sheets || [],
      createdBy: data.createdBy,
      updatedAt:
        data.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
      className: data.className || undefined,
    };
  } catch (error: any) {
    // Silently handle offline errors - don't throw
    if (error?.code === 'failed-precondition' || error?.code === 'unavailable' || error?.message?.includes('offline')) {
      console.warn('Firestore offline - retrying...');
      return null;
    }
    console.error("Error fetching exam:", error);
    throw new Error("Failed to fetch exam");
  }
}

/**
 * Update an existing exam
 */
export async function updateExam(
  examId: string,
  updates: Partial<Exam>,
): Promise<void> {
  try {
    const docRef = doc(db, "exams", examId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error updating exam:", error);
    throw new Error("Failed to update exam");
  }
}

/**
 * Delete an exam
 */
export async function deleteExam(examId: string): Promise<void> {
  try {
    const docRef = doc(db, "exams", examId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting exam:", error);
    throw new Error("Failed to delete exam");
  }
}

/**
 * Add an answer key to an exam
 */
export async function addAnswerKeyToExam(
  examId: string,
  answerKeyId: string,
): Promise<void> {
  try {
    const docRef = doc(db, "exams", examId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Exam not found");
    }

    const currentAnswerKeys = docSnap.data().answer_keys || [];

    await updateDoc(docRef, {
      answer_keys: [...currentAnswerKeys, answerKeyId],
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error adding answer key to exam:", error);
    throw new Error("Failed to add answer key to exam");
  }
}

/**
 * Add a generated sheet to an exam
 */
export async function addGeneratedSheetToExam(
  examId: string,
  sheet: GeneratedSheet,
): Promise<void> {
  try {
    const docRef = doc(db, "exams", examId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Exam not found");
    }

    const currentSheets = docSnap.data().generated_sheets || [];

    await updateDoc(docRef, {
      generated_sheets: [...currentSheets, sheet],
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error adding generated sheet to exam:", error);
    throw new Error("Failed to add generated sheet to exam");
  }
}
