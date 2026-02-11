'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; 
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { 
  FileText, 
  Users, 
  ClipboardList, 
  Plus,
  TrendingUp,
  Clock
} from 'lucide-react';
import { CreateExamModal } from '@/components/modals/CreateExamModal';
import { toast } from 'sonner';

interface DashboardStats {
  totalExams: number;
  totalStudents: number;
  totalSheets: number;
  recentExams: Array<{
    id: string;
    title: string;
    subject: string;
    num_items: number;
    created_at: string;
  }>;
}

interface ExamFormData {
  name: string;
  totalQuestions: number;
  date: string;
  subject: string;
  folder: string;
}

export default function Dashboard() {
  const { userRole } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalExams: 0,
    totalStudents: 0,
    totalSheets: 0,
    recentExams: [],
  });
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        setStats({
          totalExams: 0,
          totalStudents: 0,
          totalSheets: 0,
          recentExams: [],
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

const handleCreateExam = async (formData: ExamFormData) => {
  try {
    const newExam = {
      id: `exam_${Date.now()}`,
      title: formData.name,
      subject: formData.folder,
      num_items: formData.totalQuestions,
      created_at: new Date(formData.date).toISOString(),
    };

    setStats(prev => ({
      ...prev,
      totalExams: prev.totalExams + 1,
      recentExams: [newExam, ...prev.recentExams.slice(0, 4)],
    }));

    toast.success(`Exam "${formData.name}" created successfully`);
    setShowCreateModal(false);
    
    const params = new URLSearchParams({
      title: formData.name,
      subject: formData.folder,
      items: formData.totalQuestions.toString(),
      date: formData.date,
      choices: '4', 
    });
    
    router.push(`/exams?${params.toString()}`);
    
  } catch (error) {
    console.error('Error creating exam:', error);
    toast.error('Failed to create exam');
  }
};

  const statCards = [
    {
      title: 'Total Exams',
      value: stats.totalExams,
      icon: FileText,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      title: 'Students',
      value: stats.totalStudents,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Answer Sheets',
      value: stats.totalSheets,
      icon: ClipboardList,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
  ];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here's an overview of your exam management system.
        </p>
      </div>

      {/* Role Notice */}
      {!userRole && (
        <Card className="mb-6 border-warning/30 bg-warning/5">
          <CardContent className="py-4">
            <p className="text-sm text-warning flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Your account is pending role assignment. Please contact an administrator.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="stat-card animate-slide-up">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-bold mt-1">
                      {loading ? '-' : stat.value}
                    </p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions & Recent Exams */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              className="w-full justify-start gap-3 h-12" 
              variant="outline"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="w-4 h-4" />
              Create New Exam
            </Button>
            <Link href="/students">
              <Button className="w-full justify-start gap-3 h-12" variant="outline">
                <Users className="w-4 h-4" />
                Manage Students
              </Button>
            </Link>
            <Link href="/exams">
              <Button className="w-full justify-start gap-3 h-12" variant="outline">
                <FileText className="w-4 h-4" />
                View All Exams
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Exams */}
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent" />
              Recent Exams
            </CardTitle>
            <Link href="/exams">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : stats.recentExams.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No exams created yet</p>
                <Button 
                  variant="link" 
                  className="mt-2"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create your first exam
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentExams.map((exam) => (
                  <Link 
                    key={exam.id} 
                    href={`/exams/${exam.id}`}
                    className="block p-3 rounded-lg border hover:border-accent/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{exam.title}</p>
                        <p className="text-sm text-muted-foreground">{exam.subject}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{exam.num_items} items</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(exam.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add the CreateExamModal component */}
      <CreateExamModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateExam={handleCreateExam}
      />
    </div>
  );
}
