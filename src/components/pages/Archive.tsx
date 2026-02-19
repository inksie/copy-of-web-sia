'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Archive as ArchiveIcon, Search, FileText, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getArchivedExams, type Exam } from '@/services/examService';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function Archive() {
  const { user } = useAuth();
  const [archivedExams, setArchivedExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchArchivedExams = async () => {
      try {
        if (!user?.id) {
          setArchivedExams([]);
          setLoading(false);
          return;
        }

        const exams = await getArchivedExams(user.id);
        setArchivedExams(exams);
      } catch (error) {
        console.error('Error fetching archived exams:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArchivedExams();
  }, [user]);

  const filteredExams = archivedExams.filter(
    (exam) =>
      exam.title.toLowerCase().includes(search.toLowerCase()) ||
      exam.subject.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="page-container">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Archive</h1>
        <p className="text-muted-foreground mt-1">Read-only historical records of past exams and grades.</p>
      </div>

      {/* Search */}
      <Card className="mt-6 mb-6">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              type="text" 
              placeholder="Search archived exams..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </Card>

      {/* Archive Info */}
      <Card className="p-4 border-l-4 border-l-gray-500 bg-gray-50">
        <p className="text-sm text-gray-700">
          <strong>Note:</strong> Archived exams are read-only. All associated data (answer keys, scanned sheets, grades) are preserved.
        </p>
      </Card>

      {/* Archived Exams Table */}
      <Card className="mt-6 table-container overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header hover:bg-table-header">
              <TableHead>Title</TableHead>
              <TableHead className="hidden sm:table-cell">Subject</TableHead>
              <TableHead className="hidden md:table-cell">Items</TableHead>
              <TableHead className="hidden lg:table-cell">Class</TableHead>
              <TableHead className="hidden sm:table-cell">Archived Date</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Loading archived exams...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredExams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <ArchiveIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">
                    {search
                      ? "No archived exams found matching your search"
                      : "No archived exams yet."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredExams.map((exam) => (
                <TableRow key={exam.id} className="hover:bg-table-row-hover">
                  <TableCell className="font-medium">{exam.title}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{exam.subject}</TableCell>
                  <TableCell className="text-center hidden md:table-cell">{exam.num_items}</TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">{exam.className || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                    {exam.archivedAt ? new Date(exam.archivedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/exams/${exam.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Archive Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card className="p-6 border">
          <p className="text-sm text-muted-foreground">Total Archived</p>
          <p className="text-3xl font-bold text-foreground mt-2">{archivedExams.length}</p>
        </Card>
        <Card className="p-6 border">
          <p className="text-sm text-muted-foreground">Total Questions</p>
          <p className="text-3xl font-bold text-foreground mt-2">
            {archivedExams.reduce((sum, exam) => sum + exam.num_items, 0)}
          </p>
        </Card>
        <Card className="p-6 border">
          <p className="text-sm text-muted-foreground">Last Archived</p>
          <p className="text-lg font-bold text-foreground mt-2">
            {archivedExams.length > 0
              ? new Date(archivedExams[0].archivedAt || '').toLocaleDateString()
              : '—'}
          </p>
        </Card>
      </div>
    </div>
  );
}
