'use client';

import { useEffect, useState, useRef } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { StudentIDService } from '@/services/studentIDService';
import { 
  Search, 
  Plus, 
  Trash2, 
  Loader2,
  GraduationCap,
  Upload,
  Download,
  AlertCircle,
  X
} from 'lucide-react';

interface Student {
  student_id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

interface Class {
  id: string;
  class_name: string;
  course_subject: string;
  section_block: string;
  room: string;
  students: Student[];
  created_at: string;
  schedule_day?: string;
  schedule_time?: string;
  semester?: string;
  school_year?: string;
}

export default function StudentClasses() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [currentTab, setCurrentTab] = useState('basic');
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<Student[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  
  const [newClass, setNewClass] = useState({
    class_name: '',
    course_subject: '',
    section_block: '',
    room: '',
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [newStudent, setNewStudent] = useState({
    student_id: '',
    first_name: '',
    last_name: '',
    email: '',
  });

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      // TODO: Fetch from Firestore
      // For now, using mock data
      const mockClasses: Class[] = [
        {
          id: '1',
          class_name: 'Computer Science 101',
          course_subject: 'Introduction to Programming',
          section_block: 'A',
          room: 'Room 301',
          
          students: [
            { student_id: '2021001', first_name: 'John', last_name: 'Doe', email: 'john.doe@example.com' },
            { student_id: '2021002', first_name: 'Jane', last_name: 'Smith', email: 'jane.smith@example.com' },
          ],
          created_at: new Date().toISOString(),
        },
      ];
      setClasses(mockClasses);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClass = async () => {
    if (!newClass.class_name || !newClass.course_subject || !newClass.section_block) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const classToAdd: Class = {
        id: Date.now().toString(),
        ...newClass,
        students: students,
        created_at: new Date().toISOString(),
      };

      // TODO: Save to Firestore
      setClasses([...classes, classToAdd]);
      
      setShowAddDialog(false);
      setNewClass({
        class_name: '',
        course_subject: '',
        section_block: '',
        room: '',
      });
      setStudents([]);
      setCurrentTab('basic');
      
      toast.success('Class added successfully');
    } catch (error) {
      console.error('Error adding class:', error);
      toast.error('Failed to add class');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      // TODO: Delete from Firestore
      setClasses(classes.filter(c => c.id !== deleteId));
      setDeleteId(null);
      toast.success('Class deleted successfully');
    } catch (error) {
      console.error('Error deleting class:', error);
      toast.error('Failed to delete class');
    }
  };

  const handleAddStudent = async () => {
    if (!newStudent.first_name.trim() || !newStudent.last_name.trim()) {
      toast.error('Please fill in first name and last name');
      return;
    }

    let studentId = newStudent.student_id.trim();

    // Auto-generate when Student ID is not provided
    if (!studentId) {
      const generated = await StudentIDService.autoAssignIDs([
        {
          student_id: '',
          first_name: newStudent.first_name.trim(),
          last_name: newStudent.last_name.trim(),
          email: newStudent.email.trim() || undefined,
        },
      ]);

      if (!generated.success || !generated.ids || generated.ids.length === 0) {
        toast.error(generated.error || 'Failed to auto-generate student ID');
        return;
      }

      studentId = generated.ids[0];
    }

    // Check for duplicate student ID
    if (students.some(s => s.student_id === studentId)) {
      toast.error(`Student ID "${studentId}" already exists in this class`);
      return;
    }

    // Check for duplicate student ID in database
    const dbConflicts = await StudentIDService.checkForConflicts([studentId]);
    if (dbConflicts.length > 0) {
      toast.error(`Student ID "${studentId}" already exists in the database`);
      return;
    }

    // Check for duplicate student name (first name + last name combination)
    if (
      students.some(
        (s) =>
          s.first_name.toLowerCase() === newStudent.first_name.trim().toLowerCase() &&
          s.last_name.toLowerCase() === newStudent.last_name.trim().toLowerCase()
      )
    ) {
      toast.error(`Student "${newStudent.first_name.trim()} ${newStudent.last_name.trim()}" already exists in this class`);
      return;
    }

    const student: Student = {
      student_id: studentId,
      first_name: newStudent.first_name.trim(),
      last_name: newStudent.last_name.trim(),
      email: newStudent.email.trim() || undefined,
    };

    setStudents([...students, student]);
    setNewStudent({
      student_id: '',
      first_name: '',
      last_name: '',
      email: '',
    });
    toast.success(`Student added to roster${newStudent.student_id.trim() ? '' : ` (ID: ${studentId})`}`);
  };

  const handleRemoveStudent = (studentId: string) => {
    setStudents(students.filter(s => s.student_id !== studentId));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setImporting(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

          const parsedStudents = rows
            .map((row) => ({
              student_id: String(row['student_id'] || row['Student ID'] || row['ID'] || row['id'] || '').trim(),
              first_name: String(row['first_name'] || row['First Name'] || row['First'] || '').trim(),
              last_name: String(row['last_name'] || row['Last Name'] || row['Last'] || '').trim(),
              email: String(row['email'] || row['Email'] || '').trim(),
            }))
            .filter((row) => row.first_name && row.last_name);

          if (parsedStudents.length === 0) {
            toast.error('No valid student records found. First name and last name are required.');
            return;
          }

          const idAssignmentResult = await StudentIDService.bulkImportStudents(parsedStudents, true);
          if (!idAssignmentResult.success) {
            toast.error(idAssignmentResult.error || 'Failed to auto-generate IDs for import');
            return;
          }

          let generatedIndex = 0;
          const studentsWithIds: Student[] = parsedStudents.map((row) => {
            const existingId = row.student_id.trim();
            if (existingId) {
              return {
                student_id: existingId,
                first_name: row.first_name,
                last_name: row.last_name,
                email: row.email || undefined,
              };
            }

            const generatedId = idAssignmentResult.ids?.[generatedIndex++];
            return {
              student_id: generatedId || '',
              first_name: row.first_name,
              last_name: row.last_name,
              email: row.email || undefined,
            };
          });

          if (studentsWithIds.some((s) => !s.student_id)) {
            toast.error('Failed to assign IDs for one or more students.');
            return;
          }

          const duplicateIdsInFile = new Set<string>();
          const seenIds = new Set<string>();
          for (const student of studentsWithIds) {
            if (seenIds.has(student.student_id)) {
              duplicateIdsInFile.add(student.student_id);
            } else {
              seenIds.add(student.student_id);
            }
          }

          if (duplicateIdsInFile.size > 0) {
            toast.error(`Duplicate IDs in file: ${Array.from(duplicateIdsInFile).join(', ')}`);
            return;
          }

          const existingClassIds = new Set(students.map((s) => s.student_id));
          const localConflicts = studentsWithIds
            .map((s) => s.student_id)
            .filter((id) => existingClassIds.has(id));
          if (localConflicts.length > 0) {
            toast.error(`IDs already in this class: ${Array.from(new Set(localConflicts)).join(', ')}`);
            return;
          }

          const dbConflicts = await StudentIDService.checkForConflicts(
            studentsWithIds.map((s) => s.student_id)
          );
          if (dbConflicts.length > 0) {
            toast.error(`IDs already exist in database: ${Array.from(new Set(dbConflicts)).join(', ')}`);
            return;
          }

          const generatedCount = parsedStudents.filter((s) => !s.student_id).length;
          setImportPreview(studentsWithIds);
          setShowImportDialog(true);
          toast.success(
            `Ready to import ${studentsWithIds.length} student(s)` +
              (generatedCount > 0 ? ` with ${generatedCount} auto-generated ID(s)` : '')
          );
        } catch (error) {
          console.error('Error parsing import file:', error);
          toast.error('Failed to parse the uploaded file');
        } finally {
          setImporting(false);
        }
      };

      reader.onerror = () => {
        setImporting(false);
        toast.error('Failed to read file');
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error importing students:', error);
      toast.error('Failed to import students');
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (importPreview.length === 0) return;

    const currentIds = new Set(students.map((s) => s.student_id));
    const idConflicts = importPreview
      .map((s) => s.student_id)
      .filter((id) => currentIds.has(id));
    if (idConflicts.length > 0) {
      toast.error(`Import blocked. Duplicate IDs in class: ${Array.from(new Set(idConflicts)).join(', ')}`);
      return;
    }

    const dbConflicts = await StudentIDService.checkForConflicts(importPreview.map((s) => s.student_id));
    if (dbConflicts.length > 0) {
      toast.error(`Import blocked. IDs already exist in database: ${Array.from(new Set(dbConflicts)).join(', ')}`);
      return;
    }

    setStudents([...students, ...importPreview]);
    setImportPreview([]);
    setShowImportDialog(false);
    toast.success(`Imported ${importPreview.length} students`);
  };

  const downloadTemplate = () => {
    const template = [
      {
        student_id: '',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        email: 'juan.delacruz@example.com',
      },
      {
        student_id: 'STU00001',
        first_name: 'Maria',
        last_name: 'Santos',
        email: 'maria.santos@example.com',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    XLSX.writeFile(workbook, 'student_classes_template.xlsx');
  };

  const filteredClasses = classes.filter(c =>
    c.class_name.toLowerCase().includes(search.toLowerCase()) ||
    c.course_subject.toLowerCase().includes(search.toLowerCase()) ||
    c.section_block.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Class</h1>
          <p className="text-muted-foreground mt-1">Manage student roster and information</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            Import Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button onClick={() => setShowAddDialog(true)} className="gradient-primary gap-2">
            <Plus className="w-4 h-4" />
            Add Class
          </Button>
        </div>
      </div>

      <Card className="card-elevated mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search students by name, ID, or course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : filteredClasses.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {search ? 'No classes found matching your search' : 'No classes yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClasses.map((classItem) => (
            <Card key={classItem.id} className="card-elevated hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedClass(classItem);
                setShowViewDialog(true);
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-6 h-6 text-yellow-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-foreground">{classItem.class_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {classItem.course_subject} • {classItem.section_block}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(classItem.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Students</p>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <GraduationCap className="w-4 h-4 text-yellow-600" />
                      {classItem.students.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Scanned</p>
                    <p className="text-sm font-medium text-primary">
                      {classItem.students.length} / {classItem.students.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Average Score</p>
                    <p className="text-sm font-medium">84%</p>
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all" 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <p className="text-xs text-right text-muted-foreground mt-1">100%</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Class Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Class</DialogTitle>
            <DialogDescription>
              Create a new class and add students to the roster
            </DialogDescription>
          </DialogHeader>

          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Class Information</TabsTrigger>
              <TabsTrigger value="students">Student Roster</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="class_name">Class Name *</Label>
                  <Input
                    id="class_name"
                    value={newClass.class_name}
                    onChange={(e) => setNewClass({ ...newClass, class_name: e.target.value })}
                    placeholder="e.g., Computer Science 101"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="course_subject">Course/Subject *</Label>
                  <Input
                    id="course_subject"
                    value={newClass.course_subject}
                    onChange={(e) => setNewClass({ ...newClass, course_subject: e.target.value })}
                    placeholder="e.g., Introduction to Programming"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="section_block">Section/Block *</Label>
                  <Input
                    id="section_block"
                    value={newClass.section_block}
                    onChange={(e) => setNewClass({ ...newClass, section_block: e.target.value })}
                    placeholder="e.g., A"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="room">Room</Label>
                  <Input
                    id="room"
                    value={newClass.room}
                    onChange={(e) => setNewClass({ ...newClass, room: e.target.value })}
                    placeholder="e.g., Room 301"
                  />
                </div>
                
              </div>
            </TabsContent>

            <TabsContent value="students" className="space-y-4 mt-4">
              <div className="flex gap-2 mb-4">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {importing ? 'Importing...' : 'Import CSV/Excel'}
                </Button>
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium">Add Student Manually</h4>
                <div className="grid grid-cols-4 gap-3">
                  <Input
                    placeholder="Student ID (optional)"
                    value={newStudent.student_id}
                    onChange={(e) => setNewStudent({ ...newStudent, student_id: e.target.value })}
                  />
                  <Input
                    placeholder="First Name"
                    value={newStudent.first_name}
                    onChange={(e) => setNewStudent({ ...newStudent, first_name: e.target.value })}
                  />
                  <Input
                    placeholder="Last Name"
                    value={newStudent.last_name}
                    onChange={(e) => setNewStudent({ ...newStudent, last_name: e.target.value })}
                  />
                  <Input
                    placeholder="Email (optional)"
                    value={newStudent.email}
                    onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddStudent} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Student
                </Button>
              </div>

              {students.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((student, idx) => (
                        <TableRow key={`new-student-${idx}`}>
                          <TableCell>{student.student_id}</TableCell>
                          <TableCell>{`${student.first_name} ${student.last_name}`}</TableCell>
                          <TableCell>{student.email || '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveStudent(student.student_id)}
                            >
                              <X className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {students.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>No students added yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddClass} className="gradient-primary">
              Add Class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Class Roster Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Class Roster</DialogTitle>
            <DialogDescription>
              Upload an Excel file (.xls, .xlsx) containing student information to create a new class or update an existing one.
            </DialogDescription>
          </DialogHeader>

          {importPreview.length > 0 ? (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 bg-yellow-100 rounded flex items-center justify-center">
                    <Upload className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">students.xlsx</p>
                    <p className="text-xs text-muted-foreground">164 KB</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="ml-auto"
                    onClick={() => {
                      setImportPreview([]);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total Rows</p>
                  <p className="text-2xl font-bold text-green-600">{importPreview.length}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Valid Students</p>
                  <p className="text-2xl font-bold text-green-600">{importPreview.length}</p>
                </div>
              </div>

              <div className="mb-4">
                <h4 className="font-medium mb-2 text-sm">Detected Student Information Fields</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span>Student Name</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span>Student ID</span>
                  </div>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.map((student, idx) => (
                      <TableRow key={`import-${idx}`}>
                        <TableCell>{student.student_id}</TableCell>
                        <TableCell>{`${student.first_name} ${student.last_name}`}</TableCell>
                        <TableCell>{student.email || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Upload className="w-8 h-8 text-yellow-600" />
              </div>
              <p className="font-medium mb-2">Click to upload or drag and drop</p>
              <p className="text-sm text-muted-foreground mb-4">Excel files only (.xls, .xlsx)</p>
              <Button 
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse Files
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowImportDialog(false);
              setImportPreview([]);
            }}>
              Cancel
            </Button>
            {importPreview.length > 0 && (
              <Button onClick={confirmImport} className="gradient-primary">
                Confirm Import
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Class Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedClass?.class_name}</DialogTitle>
            <DialogDescription>
              {selectedClass?.course_subject} - Section {selectedClass?.section_block}
            </DialogDescription>
          </DialogHeader>
          {selectedClass && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Schedule</p>
                  <p className="font-medium">{selectedClass.schedule_day}</p>
                  <p className="text-sm">{selectedClass.schedule_time}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Room</p>
                  <p className="font-medium">{selectedClass.room || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Semester</p>
                  <p className="font-medium">{selectedClass.semester || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">School Year</p>
                  <p className="font-medium">{selectedClass.school_year || '—'}</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Students ({selectedClass.students.length})</h4>
                {selectedClass.students.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedClass.students.map((student, idx) => (
                          <TableRow key={`${selectedClass.id}-student-${idx}`}>
                            <TableCell>{student.student_id}</TableCell>
                            <TableCell>{`${student.first_name} ${student.last_name}`}</TableCell>
                            <TableCell>{student.email || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No students enrolled</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowViewDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this class and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
