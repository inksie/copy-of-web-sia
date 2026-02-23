'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Download, Plus, Eye, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateTemplatePDF } from '@/lib/templatePdfGenerator';

interface Template {
  id: string;
  name: string;
  description: string;
  numQuestions: number;
  choicesPerQuestion: number;
  layout: 'single' | 'double' | 'quad';
  includeStudentId: boolean;
  studentIdLength: number;
  createdBy: string;
  instructorId?: string;
  classId?: string;
  className?: string;
  examId?: string;
  examName?: string;
  createdAt: string;
}

interface Class {
  id: string;
  class_name: string;
}

interface Exam {
  id: string;
  title: string;
}

export default function Templates() {
  const { user } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    numQuestions: 50,
    choicesPerQuestion: 4,
    layout: 'single' as 'single' | 'double' | 'quad',
    includeStudentId: true,
    studentIdLength: 10,
    classId: '',
    examId: '',
  });

  // Fetch classes and exams on mount
  useEffect(() => {
    if (user?.id) {
      fetchClassesAndExams();
      fetchTemplates();
    }
  }, [user?.id]);

  const fetchClassesAndExams = async () => {
    try {
      // Fetch classes
      const classesSnapshot = await getDocs(collection(db, 'classes'));
      const fetchedClasses = classesSnapshot.docs.map(doc => ({
        id: doc.id,
        class_name: doc.data().class_name || 'Unnamed Class',
      }));
      setClasses(fetchedClasses);

      // Fetch exams
      const examsSnapshot = await getDocs(collection(db, 'exams'));
      const fetchedExams = examsSnapshot.docs.map(doc => ({
        id: doc.id,
        title: doc.data().title || 'Unnamed Exam',
      }));
      setExams(fetchedExams);
    } catch (error) {
      console.error('Error fetching classes/exams:', error);
    }
  };

  const fetchTemplates = async () => {
    if (!user?.instructorId) {
      console.log('No instructorId found, skipping template fetch');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Query templates filtered by current user's instructorId
      const templatesQuery = query(
        collection(db, 'templates'),
        where('instructorId', '==', user.instructorId)
      );
      const templatesSnapshot = await getDocs(templatesQuery);
      const fetchedTemplates = templatesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Template));
      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!user?.instructorId) {
      toast.error('⚠️ Instructor ID not found. Please log out and log back in.');
      return;
    }

    if (!newTemplate.name.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    console.log('📝 Creating template...');
    console.log('  - Template data:', newTemplate);
    console.log('  - InstructorId:', user.instructorId);

    try {
      // Get class and exam names if IDs are provided
      const selectedClass = classes.find(c => c.id === newTemplate.classId);
      const selectedExam = exams.find(e => e.id === newTemplate.examId);

      const templateData = {
        name: newTemplate.name,
        description: newTemplate.description,
        numQuestions: newTemplate.numQuestions,
        choicesPerQuestion: newTemplate.choicesPerQuestion,
        layout: newTemplate.layout,
        includeStudentId: newTemplate.includeStudentId,
        studentIdLength: newTemplate.studentIdLength,
        createdBy: user.id,
        instructorId: user.instructorId,
        ...(newTemplate.classId && newTemplate.classId !== 'none' && {
          classId: newTemplate.classId,
          className: selectedClass?.class_name,
        }),
        ...(newTemplate.examId && newTemplate.examId !== 'none' && {
          examId: newTemplate.examId,
          examName: selectedExam?.title,
        }),
        createdAt: serverTimestamp(),
      };

      // Save to Firestore
      const docRef = await addDoc(collection(db, 'templates'), templateData);
      console.log('✅ Template created with ID:', docRef.id);

      // Refresh templates list
      await fetchTemplates();
      
      setShowCreateDialog(false);
      toast.success('Template created successfully!');
      
      // Reset form
      setNewTemplate({
        name: '',
        description: '',
        numQuestions: 50,
        choicesPerQuestion: 4,
        layout: 'single',
        includeStudentId: true,
        studentIdLength: 10,
        classId: '',
        examId: '',
      });
    } catch (error) {
      console.error('❌ Error creating template:', error);
      toast.error('Failed to create template');
    }
  };

  const handlePreview = (template: Template) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  const handleDownload = async (template: Template) => {
    try {
      toast.info('📄 Generating PDF...');
      await generateTemplatePDF({
        name: template.name,
        description: template.description,
        numQuestions: template.numQuestions,
        choicesPerQuestion: template.choicesPerQuestion,
        examName: template.examName,
        className: template.className,
      });
      toast.success(`✅ Downloaded ${template.name}`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const confirmDelete = (template: Template) => {
    setTemplateToDelete(template);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;

    try {
      await deleteDoc(doc(db, 'templates', templateToDelete.id));
      setTemplates((prev) => prev.filter((t) => t.id !== templateToDelete.id));
      toast.success(`"${templateToDelete.name}" deleted successfully`);
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    } finally {
      setShowDeleteDialog(false);
      setTemplateToDelete(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Answer Sheet Templates</h1>
        <p className="text-muted-foreground mt-1">Create ZipGrade-inspired answer sheet templates for optical scanning.</p>
      </div>

      {/* Loading State */}
      {loading ? (
        <Card className="p-8 border text-center">
          <p className="text-muted-foreground">Loading templates...</p>
        </Card>
      ) : templates.length === 0 ? (
        <Card className="p-8 border text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">No templates created yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first answer sheet template with customizable questions, choices, and layout options.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="p-6 border hover:shadow-md hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                  {template.numQuestions} Questions
                </span>
              </div>
              
              <h3 className="font-semibold text-foreground mb-2">{template.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {template.description || 'No description'}
              </p>
              
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <span className="font-medium">Choices:</span>
                  <span>A-{String.fromCharCode(64 + template.choicesPerQuestion)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Items:</span>
                  <span>{template.numQuestions}</span>
                </div>
              </div>

              {/* Show linked class/exam */}
              {(template.className || template.examName) && (
                <div className="mb-4 p-2 bg-blue-50 rounded text-xs space-y-1">
                  {template.className && (
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-blue-700">Class:</span>
                      <span className="text-blue-600">{template.className}</span>
                    </div>
                  )}
                  {template.examName && (
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-blue-700">Exam:</span>
                      <span className="text-blue-600">{template.examName}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handlePreview(template)}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Preview
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleDownload(template)}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Answer Sheet Template</DialogTitle>
            <DialogDescription>
              Create a ZipGrade-inspired answer sheet template with customizable options.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Template Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                placeholder="e.g., 50-Question Multiple Choice"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Brief description of the template"
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
              />
            </div>

            {/* Number of Questions */}
            <div className="space-y-2">
              <Label htmlFor="numQuestions">Number of Questions *</Label>
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

            {/* Link to Class */}
            <div className="space-y-2">
              <Label htmlFor="classId">Link to Class (Optional)</Label>
              <Select
                value={newTemplate.classId}
                onValueChange={(value) => setNewTemplate({ ...newTemplate, classId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.class_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Link to Exam */}
            <div className="space-y-2">
              <Label htmlFor="examId">Link to Exam (Optional)</Label>
              <Select
                value={newTemplate.examId}
                onValueChange={(value) => setNewTemplate({ ...newTemplate, examId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an exam" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {exams.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Choices Per Question */}
            <div className="space-y-2">
              <Label htmlFor="choices">Choices Per Question *</Label>
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

            {/* Layout */}
            <div className="space-y-2">
              <Label htmlFor="layout">Page Layout *</Label>
              <Select
                value={newTemplate.layout}
                onValueChange={(value: 'single' | 'double' | 'quad') => setNewTemplate({ ...newTemplate, layout: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Column (1-100)</SelectItem>
                  <SelectItem value="double">Double Column (1-50, 51-100)</SelectItem>
                  <SelectItem value="quad">Quad Layout (ZipGrade style)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Student ID Options */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="includeStudentId">Include Student ID Section</Label>
                <input
                  type="checkbox"
                  id="includeStudentId"
                  className="h-4 w-4"
                  checked={newTemplate.includeStudentId}
                  onChange={(e) => setNewTemplate({ ...newTemplate, includeStudentId: e.target.checked })}
                />
              </div>
            </div>

            {newTemplate.includeStudentId && (
              <div className="space-y-2 pl-4 border-l-2">
                <Label htmlFor="studentIdLength">Student ID Length</Label>
                <Select
                  value={newTemplate.studentIdLength.toString()}
                  onValueChange={(value) => setNewTemplate({ ...newTemplate, studentIdLength: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 digits</SelectItem>
                    <SelectItem value="8">8 digits</SelectItem>
                    <SelectItem value="10">10 digits</SelectItem>
                    <SelectItem value="12">12 digits</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate}>
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Template Preview: {previewTemplate?.name}</DialogTitle>
            <DialogDescription>
              Preview of how the answer sheet will look when printed (A4 size)
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-lg p-4 bg-gray-200 overflow-auto" style={{ maxHeight: '65vh' }}>
            {previewTemplate && (() => {
              const numQ = previewTemplate.numQuestions;
              const numC = previewTemplate.choicesPerQuestion;
              const choiceLetters = ['A', 'B', 'C', 'D', 'E'].slice(0, numC);

              // Reusable: question block component
              const QBlock = ({ startQ, endQ }: { startQ: number; endQ: number }) => (
                <div>
                  {/* Header: ■ A B C D */}
                  <div className="flex items-center gap-[2px] mb-[2px]">
                    <div className="w-[6px] h-[6px] bg-black flex-shrink-0"></div>
                    <div className="w-[14px]"></div>
                    {choiceLetters.map(c => (
                      <div key={c} className="w-[10px] text-center text-[6px] font-bold leading-none">{c}</div>
                    ))}
                  </div>
                  {/* Rows */}
                  {Array.from({ length: endQ - startQ + 1 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-[2px] mb-[1px]">
                      <div className="w-[6px]"></div>
                      <div className="w-[14px] text-right text-[6px] font-bold leading-none pr-[2px]">{startQ + i}</div>
                      {choiceLetters.map((_, j) => (
                        <div key={j} className="w-[10px] h-[10px] rounded-full border border-gray-800 bg-white flex-shrink-0"></div>
                      ))}
                    </div>
                  ))}
                </div>
              );

              // Reusable: ID section
              const IdSection = ({ small }: { small?: boolean }) => (
                <div className={`border border-black ${small ? 'p-1' : 'p-1.5'}`}>
                  <div className={`${small ? 'text-[6px]' : 'text-[7px]'} font-bold mb-0.5`}>Student ZipGrade ID</div>
                  {/* Input boxes */}
                  <div className="flex gap-[2px] mb-[2px]">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className={`${small ? 'w-[8px] h-[7px]' : 'w-[10px] h-[8px]'} border border-black`}></div>
                    ))}
                  </div>
                  {/* Bubble grid */}
                  <div className="flex gap-[1px] items-start">
                    <div className="flex flex-col">
                      {[0,1,2,3,4,5,6,7,8,9].map(n => (
                        <div key={n} className={`${small ? 'h-[8px] text-[5px]' : 'h-[10px] text-[6px]'} flex items-center font-bold w-[8px] justify-end pr-[1px]`}>{n}</div>
                      ))}
                    </div>
                    {Array.from({ length: 10 }).map((_, col) => (
                      <div key={col} className="flex flex-col">
                        {[0,1,2,3,4,5,6,7,8,9].map(row => (
                          <div key={row} className={`${small ? 'w-[7px] h-[7px] m-[0.5px]' : 'w-[9px] h-[9px] m-[0.5px]'} rounded-full border border-gray-800 bg-white`}></div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );

              // Reusable: mini sheet (for 20Q and 50Q)
              const MiniSheet = ({ questions, sheetW, sheetH }: { questions: number; sheetW: string; sheetH: string }) => (
                <div className="bg-white border border-black relative" style={{ width: sheetW, height: sheetH, padding: '6px' }}>
                  {/* Corner markers */}
                  <div className="absolute top-[4px] left-[4px] w-[5px] h-[5px] bg-black"></div>
                  <div className="absolute top-[4px] right-[4px] w-[5px] h-[5px] bg-black"></div>
                  <div className="absolute bottom-[4px] left-[4px] w-[5px] h-[5px] bg-black"></div>
                  <div className="absolute bottom-[4px] right-[4px] w-[5px] h-[5px] bg-black"></div>

                  {/* Header */}
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <div className="w-[10px] h-[10px] bg-green-700 rounded-full flex items-center justify-center text-white text-[5px] font-bold">G</div>
                    <span className="text-[7px] font-bold">Gordon College</span>
                  </div>

                  {/* Name/Date */}
                  <div className="flex gap-1 mb-1 text-[5px]">
                    <div className="flex-1">
                      <span className="font-semibold">Name:</span>
                      <div className="border-b border-black mt-[1px]"></div>
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold">Date:</span>
                      <div className="border-b border-black mt-[1px]"></div>
                    </div>
                  </div>

                  {/* ID Section */}
                  <div className="mb-1">
                    <IdSection small />
                  </div>

                  {/* Answer blocks */}
                  {questions === 20 ? (
                    <div className="flex gap-2 mt-1">
                      <QBlock startQ={1} endQ={10} />
                      <QBlock startQ={11} endQ={20} />
                    </div>
                  ) : (
                    <div className="flex gap-1 mt-1">
                      <div className="space-y-1">
                        <QBlock startQ={1} endQ={10} />
                        <QBlock startQ={11} endQ={20} />
                        <QBlock startQ={21} endQ={30} />
                      </div>
                      <div className="space-y-1">
                        <QBlock startQ={31} endQ={40} />
                        <QBlock startQ={41} endQ={50} />
                      </div>
                    </div>
                  )}
                </div>
              );

              if (numQ === 20) {
                // 20Q: 4 mini sheets in 2x2 grid
                return (
                  <div className="mx-auto bg-white border border-gray-400 shadow-lg" style={{ width: '420px', aspectRatio: '210/297', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
                    <MiniSheet questions={20} sheetW="100%" sheetH="100%" />
                    <MiniSheet questions={20} sheetW="100%" sheetH="100%" />
                    <MiniSheet questions={20} sheetW="100%" sheetH="100%" />
                    <MiniSheet questions={20} sheetW="100%" sheetH="100%" />
                  </div>
                );
              } else if (numQ === 50) {
                // 50Q: 2 side by side
                return (
                  <div className="mx-auto bg-white border border-gray-400 shadow-lg" style={{ width: '420px', aspectRatio: '210/297', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <MiniSheet questions={50} sheetW="100%" sheetH="100%" />
                    <MiniSheet questions={50} sheetW="100%" sheetH="100%" />
                  </div>
                );
              } else {
                // 100Q: Full page
                return (
                  <div className="mx-auto bg-white border border-gray-400 shadow-lg relative" style={{ width: '420px', aspectRatio: '210/297', padding: '10px' }}>
                    {/* Corner markers */}
                    <div className="absolute top-[4px] left-[4px] w-[8px] h-[8px] bg-black"></div>
                    <div className="absolute top-[4px] right-[4px] w-[8px] h-[8px] bg-black"></div>
                    <div className="absolute bottom-[4px] left-[4px] w-[8px] h-[8px] bg-black"></div>
                    <div className="absolute bottom-[4px] right-[4px] w-[8px] h-[8px] bg-black"></div>

                    {/* Header */}
                    <div className="flex items-center justify-center gap-1.5 mb-1.5">
                      <div className="w-[14px] h-[14px] bg-green-700 rounded-full flex items-center justify-center text-white text-[7px] font-bold">G</div>
                      <span className="text-[11px] font-bold">Gordon College</span>
                    </div>

                    {/* Name/Date */}
                    <div className="flex gap-3 mb-2 text-[7px]">
                      <div className="flex-[3]">
                        <span className="font-bold">Name:</span>
                        <div className="border-b border-black mt-[1px] ml-1"></div>
                      </div>
                      <div className="flex-[2]">
                        <span className="font-bold">Date:</span>
                        <div className="border-b border-black mt-[1px] ml-1"></div>
                      </div>
                    </div>

                    {/* Top section: ID + Q41-50 + Q71-80 */}
                    <div className="flex gap-2 mb-2 items-start">
                      <div className="flex-shrink-0">
                        <IdSection />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <QBlock startQ={41} endQ={50} />
                        <QBlock startQ={71} endQ={80} />
                      </div>
                    </div>

                    {/* Bottom: 4 cols x 2 rows */}
                    <div className="flex gap-2 mb-1">
                      <QBlock startQ={1} endQ={10} />
                      <QBlock startQ={21} endQ={30} />
                      <QBlock startQ={51} endQ={60} />
                      <QBlock startQ={81} endQ={90} />
                    </div>
                    <div className="flex gap-2">
                      <QBlock startQ={11} endQ={20} />
                      <QBlock startQ={31} endQ={40} />
                      <QBlock startQ={61} endQ={70} />
                      <QBlock startQ={91} endQ={100} />
                    </div>

                    {/* Footer */}
                    <div className="absolute bottom-[6px] left-0 right-0 text-center text-[5px] text-gray-500 italic">
                      Do not fold, staple, or tear this answer sheet.
                    </div>
                  </div>
                );
              }
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close
            </Button>
            <Button onClick={() => previewTemplate && handleDownload(previewTemplate)}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>&quot;{templateToDelete?.name}&quot;</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guidelines Card */}
      <Card className="p-6 border bg-blue-50/50">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Template Guidelines
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="text-blue-600 font-bold">•</span>
            <span>Templates include alignment markers (black squares) for optical scanning accuracy</span>
          </li>
          <li className="flex gap-3">
            <span className="text-blue-600 font-bold">•</span>
            <span>Student ID section uses bubble format for easy scanning and validation</span>
          </li>
          <li className="flex gap-3">
            <span className="text-blue-600 font-bold">•</span>
            <span>Print on standard Letter (8.5" x 11") white paper for best results</span>
          </li>
          <li className="flex gap-3">
            <span className="text-blue-600 font-bold">•</span>
            <span>Instruct students to use #2 pencils and fill bubbles completely</span>
          </li>
          <li className="flex gap-3">
            <span className="text-blue-600 font-bold">•</span>
            <span>Test templates before large-scale use to ensure scanner compatibility</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
