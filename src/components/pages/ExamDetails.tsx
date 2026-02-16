"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Edit2,
  Smartphone,
  FileText,
  BarChart3,
  Tag,
} from "lucide-react";
import { getExamById, Exam } from "@/services/examService";
import { AnswerKeyService } from "@/services/answerKeyService";

interface ExamDetailsProps {
  params: { id: string };
}

interface AnswerKeyStatus {
  total: number;
  completed: number;
  hasAnswerKey: boolean;
}

export default function ExamDetails({ params }: ExamDetailsProps) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [answerKeyStatus, setAnswerKeyStatus] = useState<AnswerKeyStatus>({
    total: 0,
    completed: 0,
    hasAnswerKey: false,
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

  const actionButtons = [
    {
      icon: Edit2,
      label: "Edit Answer Key",
      description: "Set correct answers for each question",
      href: `/exams/${params.id}/edit-key`,
      color: "bg-blue-50 text-primary",
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
            return (
              <Link key={btn.label} href={btn.href} className="group">
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
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
