'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation'; 
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Search, FileText, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreateExamModal } from '@/components/modals/CreateExamModal';

interface Exam {
  id: string;
  title: string;
  subject: string;
  num_items: number;
  choices_per_item: number;
  created_at: string;
  answer_keys: { id: string }[];
  generated_sheets: { sheet_count: number }[];
}

interface ExamFormData {
  name: string;
  totalQuestions: number;
  date: string;
  folder: string;
}

export default function Exams() {
  const searchParams = useSearchParams(); 
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const title = searchParams.get('title');
    const subject = searchParams.get('subject');
    const items = searchParams.get('items');
    const date = searchParams.get('date');
    const choices = searchParams.get('choices');

    if (title && subject && items && date) {
      const examExists = exams.some(exam => 
        exam.title === title && 
        exam.subject === subject && 
        exam.num_items === parseInt(items)
      );

      if (!examExists) {
        const newExam: Exam = {
          id: `exam_${Date.now()}`,
          title: title,
          subject: subject,
          num_items: parseInt(items),
          choices_per_item: choices ? parseInt(choices) : 4,
          created_at: new Date(date).toISOString(),
          answer_keys: [],
          generated_sheets: []
        };

        setExams(prev => [newExam, ...prev]);
        toast.success(`Exam "${title}" added successfully`);

        window.history.replaceState(null, '', '/exams');
      }
    }
  }, [searchParams, exams]); 

  const fetchExams = async () => {
    try {
      setExams([]);
    } catch (error) {
      console.error('Error fetching exams:', error);
      toast.error('Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleCreateExam = async (formData: ExamFormData) => {
    try {
      const newExam: Exam = {
        id: `exam_${Date.now()}`,
        title: formData.name,
        subject: formData.folder,
        num_items: formData.totalQuestions,
        choices_per_item: 4,
        created_at: new Date(formData.date).toISOString(),
        answer_keys: [],
        generated_sheets: []
      };

      setExams([newExam, ...exams]);
      toast.success(`Exam "${formData.name}" created successfully`);
      setShowCreateModal(false);
    } catch (error) {
      console.error('Error creating exam:', error);
      toast.error('Failed to create exam');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      toast.success('Exam deleted successfully');
      setExams(exams.filter(e => e.id !== deleteId));
    } catch (error) {
      console.error('Error deleting exam:', error);
      toast.error('Failed to delete exam');
    } finally {
      setDeleteId(null);
    }
  };

  const filteredExams = exams.filter(exam =>
    exam.title.toLowerCase().includes(search.toLowerCase()) ||
    exam.subject.toLowerCase().includes(search.toLowerCase())
  );

  const getTotalSheets = (exam: Exam) => {
    return exam.generated_sheets?.reduce((sum, s) => sum + (s.sheet_count || 0), 0) || 0;
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Exams</h1>
          <p className="text-muted-foreground mt-1">Manage your exams and answer keys</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create New Exam
        </button>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="table-container">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header hover:bg-table-header">
              <TableHead>Title</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-center">Choices</TableHead>
              <TableHead className="text-center">Answer Key</TableHead>
              <TableHead className="text-center">Sheets Generated</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Loading exams...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredExams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground">
                    {search ? 'No exams found matching your search' : 'No exams created yet'}
                  </p>
                  {!search && (
                    <Button 
                      variant="link" 
                      className="mt-2"
                      onClick={() => setShowCreateModal(true)}
                    >
                      Create your first exam
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filteredExams.map((exam) => (
                <TableRow key={exam.id} className="hover:bg-table-row-hover">
                  <TableCell className="font-medium">{exam.title}</TableCell>
                  <TableCell className="text-muted-foreground">{exam.subject}</TableCell>
                  <TableCell className="text-center">{exam.num_items}</TableCell>
                  <TableCell className="text-center">{exam.choices_per_item}</TableCell>
                  <TableCell className="text-center">
                    {exam.answer_keys?.length === exam.num_items ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                        Complete
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning">
                        {exam.answer_keys?.length || 0}/{exam.num_items}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{getTotalSheets(exam)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/exams/${exam.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(exam.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Exam Modal */}
      <CreateExamModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateExam={handleCreateExam}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exam</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this exam? This will also delete all associated answer keys and generated sheets. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

