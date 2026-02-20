"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Edit2,
  Smartphone,
  FileText,
  BarChart3,
  Tag,
  FilePlus,
} from "lucide-react";
import { getExamById, Exam } from "@/services/examService";
import { AnswerKeyService } from "@/services/answerKeyService";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { generateTemplatePDF } from "@/lib/templatePdfGenerator";

interface ExamDetailsProps {
  params: { id: string };
}

interface AnswerKeyStatus {
  total: number;
  completed: number;
  hasAnswerKey: boolean;
}

export default function ExamDetails({ params }: ExamDetailsProps) {
  const { user } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [answerKeyStatus, setAnswerKeyStatus] = useState<AnswerKeyStatus>({
    total: 0,
    completed: 0,
    hasAnswerKey: false,
  });
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    numQuestions: 20,
    choicesPerQuestion: 4,
  });

  useEffect(() => {
    async function fetchExam() {
      try {
        setLoading(true);
        const examData = await getExamById(params.id);
        setExam(examData);

        if (examData) {
          try {
            const result = await AnswerKeyService.getAnswerKeyByExamId(
              params.id,
            );
            if (result.success && result.data) {
              const answersCount = result.data.answers.length;
              setAnswerKeyStatus({
                total: examData.num_items,
                completed: answersCount,
                hasAnswerKey: true,
              });
            } else {
              setAnswerKeyStatus({
                total: examData.num_items,
                completed: 0,
                hasAnswerKey: false,
              });
            }
          } catch (error) {
            console.error("Error fetching answer key:", error);
          }
        }
      } catch (error) {
        console.error("Error fetching exam:", error);
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      fetchExam();
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/exams"
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Loading...</h1>
          </div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/exams"
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Exam not found
            </h1>
          </div>
        </div>
      </div>
    );
  }

  const handleCreateTemplate = async () => {
    if (!user?.instructorId) {
      toast.error('⚠️ Instructor ID not found. Please log out and log back in.');
      return;
    }

    if (!exam) {
      toast.error('Exam information not found');
      return;
    }

    try {
      console.log('🔍 Creating template with user:', {
        userId: user.id,
        instructorId: user.instructorId,
        examId: params.id,
      });

      const templateData = {
        name: exam.title,
        description: exam.subject || 'Answer Sheet Template',
        numQuestions: newTemplate.numQuestions,
        choicesPerQuestion: newTemplate.choicesPerQuestion,
        layout: 'single',
        includeStudentId: true,
        studentIdLength: 10,
        createdBy: user.id,
        instructorId: user.instructorId,
        examId: params.id,
        examName: exam.title,
        createdAt: serverTimestamp(),
      };

      console.log('📄 Template data:', templateData);

      await addDoc(collection(db, 'templates'), templateData);
      
      toast.success('✅ Template created successfully!');
      
      // Generate and download PDF
      toast.info('📄 Generating PDF...');
      generateTemplatePDF({
        name: exam.title,
        description: exam.subject || 'Answer Sheet Template',
        numQuestions: newTemplate.numQuestions,
        choicesPerQuestion: newTemplate.choicesPerQuestion,
        examName: exam.title,
      });
      
      setShowCreateTemplate(false);
      
      // Reset form
      setNewTemplate({
        numQuestions: 20,
        choicesPerQuestion: 4,
      });
    } catch (error) {
      console.error('❌ Error creating template:', error);
      toast.error('Failed to create template. Please check permissions.');
    }
  };

  const actionButtons = [
    {
      icon: Edit2,
      label: "Edit Answer Key",
      description: "Set correct answers for each question",
      href: `/exams/${params.id}/edit-key`,
      color: "bg-blue-50 text-primary",
    },
    {
      icon: FilePlus,
      label: "Create Template",
      description: "Generate answer sheet template",
      color: "bg-green-50 text-green-600",
      onClick: () => setShowCreateTemplate(true),
    },
    {
      icon: Smartphone,
      label: "Scan Papers",
      description: "Scan and capture answer sheets",
      href: `/exams/${params.id}/scan-papers`,
      color: "bg-blue-50 text-primary",
    },
    {
      icon: FileText,
      label: "Review Papers",
      description: "Review scanned documents",
      href: `/exams/${params.id}/review-papers`,
      color: "bg-blue-50 text-primary",
    },
    {
      icon: BarChart3,
      label: "Item Analysis",
      description: "Analyze question performance",
      href: `/exams/${params.id}/item-analysis`,
      color: "bg-blue-50 text-primary",
    },
    {
      icon: Tag,
      label: "Tag Reports",
      description: "Generate tagged reports",
      href: `/exams/${params.id}/tag-reports`,
      color: "bg-blue-50 text-primary",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Link
          href="/exams"
          className="p-2 hover:bg-muted rounded-md transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold text-foreground truncate">
            {exam.title}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            ID: {exam.id}
          </p>
        </div>
      </div>

      {/* Exam Information */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-3 sm:p-4 border">
          <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase mb-1">
            Total Questions
          </p>
          <p className="text-xl sm:text-2xl font-bold text-primary">
            {exam.num_items}
          </p>
        </Card>
        <Card className="p-3 sm:p-4 border">
          <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase mb-1">
            Exam Date
          </p>
          <p className="text-xl sm:text-2xl font-bold text-foreground">
            {new Date(exam.created_at).toLocaleDateString()}
          </p>
        </Card>
        <Card className="p-3 sm:p-4 border">
          <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase mb-1">
            Status
          </p>
          <p className="text-xl sm:text-2xl font-bold text-primary">
            {answerKeyStatus.hasAnswerKey
              ? answerKeyStatus.completed === answerKeyStatus.total
                ? "Complete"
                : "In Progress"
              : "Not started"}
          </p>
        </Card>
        <Card className="p-3 sm:p-4 border">
          <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase mb-1">
            Folder
          </p>
          <p className="text-xl sm:text-2xl font-bold text-foreground">
            {exam.subject}
          </p>
        </Card>
      </div>

      {/* Details Card */}
      <Card className="p-6 border">
        <h2 className="text-lg font-bold text-foreground mb-4">Exam Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground font-semibold mb-1">
              Created Date
            </p>
            <p className="text-foreground">
              {new Date(exam.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground font-semibold mb-1">
              Answer Key Status
            </p>
            {answerKeyStatus.hasAnswerKey ? (
              <p
                className={`font-semibold ${
                  answerKeyStatus.completed === answerKeyStatus.total
                    ? "text-success"
                    : "text-warning"
                }`}
              >
                {answerKeyStatus.completed}/{answerKeyStatus.total} answers
              </p>
            ) : (
              <p className="font-semibold text-muted-foreground">Not started</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground font-semibold mb-1">
              Papers Scanned
            </p>
            <p className="text-foreground">
              {exam.generated_sheets.length} papers
            </p>
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {actionButtons.map((btn) => {
            const IconComponent = btn.icon;
            const content = (
              <Card className="p-4 border hover:border-primary hover:shadow-md transition-all h-full">
                <div className="flex gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg ${btn.color} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}
                  >
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {btn.label}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {btn.description}
                    </p>
                  </div>
                </div>
              </Card>
            );

            if (btn.onClick) {
              return (
                <button key={btn.label} onClick={btn.onClick} className="group text-left">
                  {content}
                </button>
              );
            }

            return (
              <Link key={btn.label} href={btn.href || '#'} className="group">
                {content}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={showCreateTemplate} onOpenChange={setShowCreateTemplate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Answer Sheet Template</DialogTitle>
            <DialogDescription>
              Create a ZipGrade-inspired answer sheet template for {exam?.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="num-questions">Number of Questions</Label>
                <Select
                  value={newTemplate.numQuestions.toString()}
                  onValueChange={(value) => setNewTemplate({ ...newTemplate, numQuestions: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 Questions</SelectItem>
                    <SelectItem value="50">50 Questions</SelectItem>
                    <SelectItem value="100">100 Questions</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="choices">Choices per Question</Label>
                <Select
                  value={newTemplate.choicesPerQuestion.toString()}
                  onValueChange={(value) => setNewTemplate({ ...newTemplate, choicesPerQuestion: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 Choices (A, B, C)</SelectItem>
                    <SelectItem value="4">4 Choices (A, B, C, D)</SelectItem>
                    <SelectItem value="5">5 Choices (A, B, C, D, E)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowCreateTemplate(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleCreateTemplate} className="flex-1">
                Create Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
