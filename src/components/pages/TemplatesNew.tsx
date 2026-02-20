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
import { FileText, Download, Plus, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
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
    try {
      setLoading(true);
      const templatesSnapshot = await getDocs(collection(db, 'templates'));
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

  const handleDownload = (template: Template) => {
    try {
      toast.info('📄 Generating PDF...');
      generateTemplatePDF({
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Answer Sheet Templates</h1>
        <p className="text-muted-foreground mt-1">Create ZipGrade-inspired answer sheet templates for optical scanning.</p>
      </div>

      {/* Create Template Button */}
      <Button 
        onClick={() => setShowCreateDialog(true)}
        className="flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Create New Template
      </Button>

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
                  <span>{template.choicesPerQuestion}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Layout:</span>
                  <span className="capitalize">{template.layout}</span>
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
              Preview of how the answer sheet will look when printed
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-lg p-8 bg-white overflow-auto" style={{ maxHeight: '60vh' }}>
            {previewTemplate && (
              <div className="max-w-[8.5in] mx-auto bg-white">
                {/* ZipGrade-style Preview */}
                <div className="border-4 border-black p-4">
                  {/* Header */}
                  <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b-2 border-black">
                    <div>
                      <div className="text-xs font-bold mb-1">Name:</div>
                      <div className="border-b border-black h-6"></div>
                    </div>
                    <div>
                      <div className="text-xs font-bold mb-1">Class:</div>
                      <div className="border-b border-black h-6"></div>
                    </div>
                    <div>
                      <div className="text-xs font-bold mb-1">Date:</div>
                      <div className="border-b border-black h-6"></div>
                    </div>
                  </div>

                  {/* Student ID Section */}
                  {previewTemplate.includeStudentId && (
                    <div className="mb-4 pb-4 border-b-2 border-black">
                      <div className="text-xs font-bold mb-2 flex items-center gap-2">
                        <span>Student Zipcode</span>
                        <div className="w-3 h-3 rounded-full border-2 border-black"></div>
                      </div>
                      <div className="flex gap-1 justify-center">
                        {Array.from({ length: previewTemplate.studentIdLength }).map((_, i) => (
                          <div key={i} className="flex flex-col items-center">
                            <div className="text-[10px] font-mono mb-0.5">{i}</div>
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                              <div key={num} className="w-4 h-4 rounded-full border border-black flex items-center justify-center text-[8px] my-0.5">
                                {num}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="text-[8px] mt-2 text-center italic">Fill in bubbles completely with #2 pencil</div>
                    </div>
                  )}

                  {/* Answer Grid - ZipGrade Style */}
                  <div className="text-center mb-2 text-xs font-bold">ZIPGRADE OMR</div>
                  <div className="grid grid-cols-4 gap-x-2 gap-y-1">
                    {Array.from({ length: Math.min(previewTemplate.numQuestions, 100) }).map((_, index) => {
                      const qNum = index + 1;
                      const choices = Array.from({ length: previewTemplate.choicesPerQuestion }).map((_, i) => 
                        String.fromCharCode(65 + i) // A, B, C, D, E
                      );
                      
                      // Add key marker every 10 questions
                      const isKeyMarker = qNum % 10 === 1 && qNum > 1;
                      
                      return (
                        <div key={qNum} className="flex items-center gap-1">
                          {isKeyMarker && <div className="w-2 h-2 bg-black rounded-full absolute -ml-3"></div>}
                          <span className="font-bold text-[10px] w-5 text-right">{qNum}</span>
                          <div className="flex gap-0.5">
                            {choices.map((choice) => (
                              <div key={choice} className="w-4 h-4 rounded-full border border-black flex items-center justify-center text-[8px] font-bold">
                                {choice}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer with QR-style markers */}
                  <div className="mt-4 pt-4 border-t-2 border-black flex justify-between items-center">
                    <div className="w-8 h-8 bg-black"></div>
                    <div className="text-center">
                      <div className="font-bold text-xs">ZIPGRADE</div>
                      <div className="text-[8px] text-gray-600">{previewTemplate.name}</div>
                      <div className="text-[8px] text-gray-600">InstructorID: {previewTemplate.instructorId}</div>
                    </div>
                    <div className="w-8 h-8 bg-black"></div>
                  </div>

                  {/* Corner markers */}
                  <div className="absolute top-0 left-0 w-8 h-8 bg-black"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 bg-black"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 bg-black"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 bg-black"></div>
                </div>
              </div>
            )}
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
