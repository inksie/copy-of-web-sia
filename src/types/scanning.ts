export type AnswerChoice = string;

export interface QuestionAnswer {
  questionNumber: number;
  correctAnswer: AnswerChoice;
  points: number;
  choiceLabels?: Record<string, string>;
}

export interface AnswerKey {
  id: string;
  examId: string;
  answers: AnswerChoice[];
  questionSettings?: QuestionAnswer[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  locked?: boolean;
  version?: number;
}

export interface StudentRoster {
  id: string;
  examId: string;
  studentIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScannedResult {
  id: string;
  examId: string;
  studentId: string;
  answers: AnswerChoice[];
  score: number;
  totalQuestions: number;
  scannedAt: string;
  scannedBy: string;
  isNullId?: boolean;
  resolved?: boolean;
}

export interface NullIdAlert {
  id: string;
  examId: string;
  scannedResultId: string;
  detectedId: string;
  timestamp: string;
  status: "new" | "resolved" | "ignored";
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionReason?: string;
  assignedStudentId?: string;
}

export interface ExamStatistics {
  totalScanned: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passingRate?: number;
}

export interface ShareableLink {
  id: string;
  examId: string;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  viewCount: number;
}
