'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Camera, 
  Upload, 
  ArrowLeft,
  RotateCcw,
  X,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Scan,
  Save,
  User
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getExamById, Exam } from '@/services/examService';
import { AnswerKeyService } from '@/services/answerKeyService';
import { ScanningService } from '@/services/scanningService';
import { getClassById, getClasses, Class, Student } from '@/services/classService';
import { toast } from 'sonner';
import { AnswerChoice } from '@/types/scanning';

interface OMRScannerProps {
  examId: string;
}

interface ScanResult {
  studentId: string;
  answers: string[];
  score: number;
  totalQuestions: number;
  percentage: number;
  letterGrade: string;
  timestamp: string;
}

export default function OMRScanner({ examId }: OMRScannerProps) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // State
  const [exam, setExam] = useState<Exam | null>(null);
  const [answerKey, setAnswerKey] = useState<AnswerChoice[]>([]);
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'select' | 'camera' | 'upload' | 'processing' | 'review' | 'results'>('select');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [, setProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [detectedAnswers, setDetectedAnswers] = useState<string[]>([]);
  const [detectedStudentId, setDetectedStudentId] = useState<string>('');
  const [matchedStudent, setMatchedStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [recentScans, setRecentScans] = useState<ScanResult[]>([]);
  const [studentIdError, setStudentIdError] = useState<string | null>(null);
  const [multipleAnswerQuestions, setMultipleAnswerQuestions] = useState<number[]>([]);
  const [idDoubleShadeColumns, setIdDoubleShadeColumns] = useState<number[]>([]);

  // Load exam data
  useEffect(() => {
    async function loadExamData() {
      try {
        setLoading(true);
        const examData = await getExamById(examId);
        if (examData) {
          setExam(examData);
          
          // Load answer key
          const akResult = await AnswerKeyService.getAnswerKeyByExamId(examId);
          if (akResult.success && akResult.data) {
            setAnswerKey(akResult.data.answers);
          }
          
          // Load class data if exam has classId
          if ((examData as any).classId) {
            const cls = await getClassById((examData as any).classId);
            if (cls) {
              setClassData(cls);
            }
          }
          
          // Fallback: if no classId but has className, try to find class by name
          if (!(examData as any).classId && examData.className && user) {
            try {
              const allClasses = await getClasses(user.id);
              const matchedClass = allClasses.find(c => 
                c.class_name === examData.className || 
                `${c.class_name} - ${c.section_block}` === examData.className
              );
              if (matchedClass) {
                setClassData(matchedClass);
              }
            } catch (e) {
              console.warn('Could not find class by name:', e);
            }
          }
        }
      } catch (error) {
        console.error('Error loading exam:', error);
        toast.error('Failed to load exam data');
      } finally {
        setLoading(false);
      }
    }
    
    loadExamData();
  }, [examId]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Update video when stream changes
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(err => {
          console.error('Error playing video:', err);
        });
      };
    }
  }, [stream]);

  // Get the template type from question count
  const getTemplateType = (): 20 | 50 | 100 => {
    const numQ = exam?.num_items || 20;
    return numQ <= 20 ? 20 : numQ <= 50 ? 50 : 100;
  };

  // Start camera
  const startCamera = async () => {
    try {
      const templateType = getTemplateType();
      // Use higher resolution for larger templates with more dense bubbles
      const constraints: MediaTrackConstraints = templateType === 20
        ? { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        : templateType === 50
        ? { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: constraints
      });
      
      setStream(mediaStream);
      setMode('camera');
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Ensure video plays when metadata is loaded
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(err => {
            console.error('Error playing video:', err);
            toast.error('Could not start video playback');
          });
        };
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Could not access camera. Please check permissions.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setMode('select');
    setCapturedImage(null);
  };

  // Get the guide frame crop region as fractions of the video dimensions
  const getGuideCropRegion = (videoWidth: number, videoHeight: number): { x: number; y: number; w: number; h: number } => {
    const t = getTemplateType();
    // These match the CSS guide overlay exactly
    // 100-item uses a tighter frame (90%) to minimize background inclusion
    const guideWidthFraction = t === 20 ? 0.75 : t === 50 ? 0.55 : 0.90;
    const paperAspect = t === 20 ? (105 / 148.5) : t === 50 ? (105 / 297) : (210 / 297); // width / height

    // In normalized coordinates (0-1 of video):
    let guideW = guideWidthFraction; // fraction of video width
    let guideH = (guideW * videoWidth) / (paperAspect * videoHeight); // fraction of video height

    // If the guide is taller than the video, clamp to video height and recalculate width
    if (guideH > 0.95) {
      guideH = 0.95;
      guideW = (guideH * videoHeight * paperAspect) / videoWidth;
    }

    // Center the crop
    const x = (1 - guideW) / 2;
    const y = (1 - guideH) / 2;

    return { x, y, w: guideW, h: guideH };
  };

  // Capture photo from camera — cropped to the guide frame
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    // Calculate the crop region matching the guide overlay
    const crop = getGuideCropRegion(vw, vh);
    const sx = Math.round(crop.x * vw);
    const sy = Math.round(crop.y * vh);
    const sw = Math.round(crop.w * vw);
    const sh = Math.round(crop.h * vh);
    
    // Set canvas to the cropped size
    canvas.width = sw;
    canvas.height = sh;
    
    // Draw only the cropped region
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    
    console.log(`[Capture] Video: ${vw}x${vh}, Crop: x=${sx} y=${sy} w=${sw} h=${sh} (template=${getTemplateType()})`);
    
    const imageData = canvas.toDataURL('image/png');
    setCapturedImage(imageData);
    setMode('review');
    
    // Stop camera after capture
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setCapturedImage(imageData);
      setMode('review');
    };
    reader.readAsDataURL(file);
  };

  // ─── DOCUMENT SCANNER: Perspective correction + enhancement ───
  // Detects the paper quadrilateral and warps it to a flat rectangle,
  // similar to CamScanner / Google Lens document scanning
  const documentScan = (srcCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = srcCanvas.getContext('2d');
    if (!ctx) return srcCanvas;
    
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const srcData = ctx.getImageData(0, 0, w, h);
    const src = srcData.data;
    
    // 1. Convert to grayscale for edge detection
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < src.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
    }
    
    // 2. Detect paper edges by scanning for bright-to-dark transitions
    //    Paper is white/bright, background is darker
    const brightThresh = 160;
    
    // Scan for left edge
    const leftEdges: number[] = [];
    for (let sy = 0; sy < h; sy += Math.max(1, Math.floor(h / 60))) {
      for (let x = 0; x < w * 0.4; x++) {
        if (gray[sy * w + x] > brightThresh) { leftEdges.push(x); break; }
      }
    }
    
    // Scan for right edge
    const rightEdges: number[] = [];
    for (let sy = 0; sy < h; sy += Math.max(1, Math.floor(h / 60))) {
      for (let x = w - 1; x > w * 0.6; x--) {
        if (gray[sy * w + x] > brightThresh) { rightEdges.push(x); break; }
      }
    }
    
    // Scan for top edge
    const topEdges: number[] = [];
    for (let sx = 0; sx < w; sx += Math.max(1, Math.floor(w / 60))) {
      for (let y = 0; y < h * 0.4; y++) {
        if (gray[y * w + sx] > brightThresh) { topEdges.push(y); break; }
      }
    }
    
    // Scan for bottom edge
    const bottomEdges: number[] = [];
    for (let sx = 0; sx < w; sx += Math.max(1, Math.floor(w / 60))) {
      for (let y = h - 1; y > h * 0.6; y--) {
        if (gray[y * w + sx] > brightThresh) { bottomEdges.push(y); break; }
      }
    }
    
    // Use percentile values for robust edge detection
    const percentile = (arr: number[], p: number) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * p)];
    };
    
    const pLeft = leftEdges.length > 3 ? percentile(leftEdges, 0.3) : 0;
    const pRight = rightEdges.length > 3 ? percentile(rightEdges, 0.7) : w - 1;
    const pTop = topEdges.length > 3 ? percentile(topEdges, 0.3) : 0;
    const pBottom = bottomEdges.length > 3 ? percentile(bottomEdges, 0.7) : h - 1;
    
    // 3. Refine corners using edge scanning at the paper boundary
    //    Find actual corners where top/bottom edges meet left/right edges
    const findCorner = (startX: number, startY: number, dirX: number, dirY: number): {x: number, y: number} => {
      // Search in a neighborhood for the sharpest bright-to-dark transition
      let bestX = startX, bestY = startY;
      const searchR = Math.min(w, h) * 0.05;
      let bestScore = -1;
      
      for (let dy = -searchR; dy <= searchR; dy += 3) {
        for (let dx = -searchR; dx <= searchR; dx += 3) {
          const cx = Math.round(startX + dx);
          const cy = Math.round(startY + dy);
          if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
          
          // Check brightness gradient at this point
          const px = Math.min(w - 1, Math.max(0, cx + dirX * 5));
          const py = Math.min(h - 1, Math.max(0, cy + dirY * 5));
          const inner = gray[cy * w + cx];
          const outer = gray[py * w + px];
          const score = inner - outer; // paper is brighter than background
          if (score > bestScore) {
            bestScore = score;
            bestX = cx;
            bestY = cy;
          }
        }
      }
      return { x: bestX, y: bestY };
    };
    
    const tl = findCorner(pLeft, pTop, -1, -1);
    const tr = findCorner(pRight, pTop, 1, -1);
    const bl = findCorner(pLeft, pBottom, -1, 1);
    const br = findCorner(pRight, pBottom, 1, 1);
    
    console.log(`[DocScan] Detected paper corners: TL=(${tl.x},${tl.y}) TR=(${tr.x},${tr.y}) BL=(${bl.x},${bl.y}) BR=(${br.x},${br.y})`);
    
    // 4. Compute output size based on A4 aspect ratio (210:297)
    const paperW = Math.max(
      Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2)),
      Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2))
    );
    const paperH = Math.max(
      Math.sqrt(Math.pow(bl.x - tl.x, 2) + Math.pow(bl.y - tl.y, 2)),
      Math.sqrt(Math.pow(br.x - tr.x, 2) + Math.pow(br.y - tr.y, 2))
    );
    
    // Use the detected dimensions but enforce minimum quality
    const outW = Math.max(800, Math.round(paperW));
    const outH = Math.max(1000, Math.round(paperH));
    
    // 5. Perspective warp using bilinear interpolation
    //    Map each output pixel back to source coordinates
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return srcCanvas;
    
    const outImgData = outCtx.createImageData(outW, outH);
    const out = outImgData.data;
    
    for (let oy = 0; oy < outH; oy++) {
      const ty = oy / outH; // 0..1 vertical
      for (let ox = 0; ox < outW; ox++) {
        const tx = ox / outW; // 0..1 horizontal
        
        // Bilinear interpolation of the 4 corners to find source position
        const topX = tl.x + tx * (tr.x - tl.x);
        const topY = tl.y + tx * (tr.y - tl.y);
        const botX = bl.x + tx * (br.x - bl.x);
        const botY = bl.y + tx * (br.y - bl.y);
        
        const sx = topX + ty * (botX - topX);
        const sy = topY + ty * (botY - topY);
        
        // Sample source pixel (nearest neighbor for speed)
        const ix = Math.round(sx);
        const iy = Math.round(sy);
        
        const oi = (oy * outW + ox) * 4;
        if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
          const si = (iy * w + ix) * 4;
          out[oi] = src[si];
          out[oi + 1] = src[si + 1];
          out[oi + 2] = src[si + 2];
          out[oi + 3] = 255;
        } else {
          out[oi] = out[oi + 1] = out[oi + 2] = 255;
          out[oi + 3] = 255;
        }
      }
    }
    
    outCtx.putImageData(outImgData, 0, 0);
    
    // 6. Adaptive brightness enhancement — makes the scan look clean
    //    Brightens the paper to pure white while preserving dark marks
    const enhData = outCtx.getImageData(0, 0, outW, outH);
    const enh = enhData.data;
    
    // Compute local brightness in a grid for adaptive enhancement
    const gridSize = 32;
    const gridW = Math.ceil(outW / gridSize);
    const gridH = Math.ceil(outH / gridSize);
    const gridMax = new Float32Array(gridW * gridH);
    
    // Find the 90th percentile brightness in each grid cell
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const samples: number[] = [];
        const y1 = gy * gridSize, y2 = Math.min(outH, (gy + 1) * gridSize);
        const x1 = gx * gridSize, x2 = Math.min(outW, (gx + 1) * gridSize);
        for (let py = y1; py < y2; py += 4) {
          for (let px = x1; px < x2; px += 4) {
            const i = (py * outW + px) * 4;
            samples.push(Math.max(enh[i], enh[i + 1], enh[i + 2]));
          }
        }
        samples.sort((a, b) => a - b);
        gridMax[gy * gridW + gx] = samples.length > 0 ? samples[Math.floor(samples.length * 0.9)] : 200;
      }
    }
    
    // Apply adaptive brightness: scale each pixel so the local paper white → 250
    for (let py = 0; py < outH; py++) {
      for (let px = 0; px < outW; px++) {
        const gx = Math.min(gridW - 1, Math.floor(px / gridSize));
        const gy = Math.min(gridH - 1, Math.floor(py / gridSize));
        const localMax = Math.max(100, gridMax[gy * gridW + gx]);
        const scale = 250 / localMax;
        
        const i = (py * outW + px) * 4;
        enh[i] = Math.min(255, Math.round(enh[i] * scale));
        enh[i + 1] = Math.min(255, Math.round(enh[i + 1] * scale));
        enh[i + 2] = Math.min(255, Math.round(enh[i + 2] * scale));
      }
    }
    
    outCtx.putImageData(enhData, 0, 0);
    
    console.log(`[DocScan] Output: ${outW}x${outH} (from ${w}x${h})`);
    return outCanvas;
  };

  // Process the captured image using OMR
  const processImage = useCallback(async () => {
    if (!capturedImage || !exam) return;
    
    setProcessing(true);
    setMode('processing');
    
    try {
      // Create an image element
      const img = new Image();
      img.src = capturedImage;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });
      
      // Use the processing canvas to load the raw image
      const canvas = processingCanvasRef.current;
      if (!canvas) throw new Error('Canvas not available');
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // Apply document scanner: perspective correction + brightness enhancement
      console.log('[DocScan] Starting document scan...');
      const scannedCanvas = documentScan(canvas);
      
      // Update the displayed image with the scanned version
      setCapturedImage(scannedCanvas.toDataURL('image/png'));
      
      // Get image data from the scanned (perspective-corrected, enhanced) canvas
      const scannedCtx = scannedCanvas.getContext('2d');
      if (!scannedCtx) throw new Error('Scanned canvas context not available');
      const imageData = scannedCtx.getImageData(0, 0, scannedCanvas.width, scannedCanvas.height);
      
      console.log(`[OMR] Processing scanned image: ${imageData.width}x${imageData.height}`);
      
      // Process the image to detect filled bubbles
      const { studentId, answers, multipleAnswers, idDoubleShades } = await detectBubbles(imageData, exam.num_items, exam.choices_per_item);
      
      setDetectedStudentId(studentId);
      setDetectedAnswers(answers);
      setMultipleAnswerQuestions(multipleAnswers);
      setIdDoubleShadeColumns(idDoubleShades);
      
      // Validate student ID against class roster
      let idError: string | null = null;
      let matched: Student | null = null;
      
      if (idDoubleShades.length > 0) {
        idError = `Student ID has multiple bubbles shaded in column(s): ${idDoubleShades.join(', ')}. Each column must have only one bubble shaded. Please ask the student to correct their answer sheet or manually edit the ID below.`;
      } else if (!studentId || /^0+$/.test(studentId)) {
        idError = 'No Student ID was detected. Please check if the student properly shaded their ID bubbles.';
      } else if (!classData) {
        idError = 'No class is linked to this exam. Please go to exam settings and assign a class before scanning.';
      } else {
        const student = classData.students.find(s => s.student_id === studentId);
        if (student) {
          matched = student;
        } else {
          idError = `Student ID "${studentId}" is not registered in class "${classData.class_name} - ${classData.section_block}". Please verify the student is enrolled in this class or check if the ID was shaded correctly.`;
        }
      }
      
      setMatchedStudent(matched);
      setStudentIdError(idError);
      
      // Calculate score
      let score = 0;
      const totalQuestions = Math.min(answers.length, answerKey.length);
      
      for (let i = 0; i < totalQuestions; i++) {
        if (answers[i] && answerKey[i] && answers[i].toUpperCase() === answerKey[i].toUpperCase()) {
          score++;
        }
      }
      
      const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
      const letterGrade = calculateLetterGrade(percentage);
      
      const result: ScanResult = {
        studentId,
        answers,
        score,
        totalQuestions,
        percentage,
        letterGrade,
        timestamp: new Date().toISOString()
      };
      
      setScanResult(result);
      setMode('results');
      
    } catch (error) {
      console.error('Error processing image:', error);
      toast.error('Failed to process image. Please try again with a clearer image.');
      setMode('review');
    } finally {
      setProcessing(false);
    }
  }, [capturedImage, exam, answerKey, classData]);

  // ─── CORNER MARKER DETECTION ───
  const findCornerMarkers = (
    binary: Uint8Array,
    width: number,
    height: number,
    grayscale?: Uint8Array
  ): {
    found: boolean;
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  } => {
    // ── Step 1: Try to detect paper boundaries using grayscale ──
    // This helps exclude background (table, shadows) from the marker search
    let paperLeft = 0, paperRight = width, paperTop = 0, paperBottom = height;
    
    if (grayscale) {
      // Scan horizontal lines to find paper edges (paper is bright, background is darker)
      const sampleRows = 20;
      const brightThreshold = 180; // pixels brighter than this are likely paper
      
      // Find left edge of paper
      const leftEdges: number[] = [];
      for (let si = 0; si < sampleRows; si++) {
        const y = Math.floor(height * (0.2 + 0.6 * si / sampleRows));
        for (let x = 0; x < width * 0.4; x++) {
          if (grayscale[y * width + x] > brightThreshold) {
            leftEdges.push(x);
            break;
          }
        }
      }
      
      // Find right edge of paper
      const rightEdges: number[] = [];
      for (let si = 0; si < sampleRows; si++) {
        const y = Math.floor(height * (0.2 + 0.6 * si / sampleRows));
        for (let x = width - 1; x > width * 0.6; x--) {
          if (grayscale[y * width + x] > brightThreshold) {
            rightEdges.push(x);
            break;
          }
        }
      }
      
      // Find top edge of paper
      const topEdges: number[] = [];
      const sampleCols = 20;
      for (let si = 0; si < sampleCols; si++) {
        const x = Math.floor(width * (0.2 + 0.6 * si / sampleCols));
        for (let y = 0; y < height * 0.4; y++) {
          if (grayscale[y * width + x] > brightThreshold) {
            topEdges.push(y);
            break;
          }
        }
      }
      
      // Find bottom edge of paper
      const bottomEdges: number[] = [];
      for (let si = 0; si < sampleCols; si++) {
        const x = Math.floor(width * (0.2 + 0.6 * si / sampleCols));
        for (let y = height - 1; y > height * 0.6; y--) {
          if (grayscale[y * width + x] > brightThreshold) {
            bottomEdges.push(y);
            break;
          }
        }
      }
      
      // Use median edges (robust to outliers)
      if (leftEdges.length > 3) {
        leftEdges.sort((a, b) => a - b);
        paperLeft = Math.max(0, leftEdges[Math.floor(leftEdges.length * 0.3)] - 5);
      }
      if (rightEdges.length > 3) {
        rightEdges.sort((a, b) => a - b);
        paperRight = Math.min(width, rightEdges[Math.floor(rightEdges.length * 0.7)] + 5);
      }
      if (topEdges.length > 3) {
        topEdges.sort((a, b) => a - b);
        paperTop = Math.max(0, topEdges[Math.floor(topEdges.length * 0.3)] - 5);
      }
      if (bottomEdges.length > 3) {
        bottomEdges.sort((a, b) => a - b);
        paperBottom = Math.min(height, bottomEdges[Math.floor(bottomEdges.length * 0.7)] + 5);
      }
      
      console.log(`[OMR] Paper bounds: L=${paperLeft} R=${paperRight} T=${paperTop} B=${paperBottom} (image: ${width}x${height})`);
    }
    
    const paperW = paperRight - paperLeft;
    const paperH = paperBottom - paperTop;
    const minDim = Math.min(paperW, paperH);
    
    // ── Step 2: Search for markers at multiple scales ──
    // The markers are 7mm squares on the 100-item template, ~4mm on smaller ones
    const baseMarkerSize = Math.max(10, Math.floor(minDim * 0.035));
    const markerSizes = [
      Math.floor(baseMarkerSize * 0.7),
      baseMarkerSize,
      Math.floor(baseMarkerSize * 1.3),
      Math.floor(baseMarkerSize * 1.6),
    ];
    
    // Search in the corners of the PAPER area, not the full image
    const searchFraction = 0.25;

    const findMarkerInRegion = (
      rx1: number, ry1: number, rx2: number, ry2: number
    ): { x: number; y: number; density: number; size: number } => {
      let bestX = (rx1 + rx2) / 2;
      let bestY = (ry1 + ry2) / 2;
      let bestDensity = 0;
      let bestSize = baseMarkerSize;
      
      for (const mSize of markerSizes) {
        const step = Math.max(1, Math.floor(mSize / 4));

        for (let y = ry1; y <= ry2 - mSize; y += step) {
          for (let x = rx1; x <= rx2 - mSize; x += step) {
            let filled = 0;
            let total = 0;
            for (let dy = 0; dy < mSize; dy += 2) {
              for (let dx = 0; dx < mSize; dx += 2) {
                const px = Math.min(width - 1, x + dx);
                const py = Math.min(height - 1, y + dy);
                filled += binary[py * width + px];
                total++;
              }
            }
            const density = filled / total;
            if (density > bestDensity) {
              // Additional check: verify surrounding area is NOT also dark
              // (to reject table edges / shadows which are large dark areas)
              if (grayscale) {
                const cx = x + mSize / 2;
                const cy = y + mSize / 2;
                const checkDist = mSize * 1.5;
                let surroundBright = 0, surroundCount = 0;
                
                // Check brightness in a ring around the candidate
                for (const [ox, oy] of [
                  [-checkDist, 0], [checkDist, 0], [0, -checkDist], [0, checkDist],
                  [-checkDist, -checkDist], [checkDist, -checkDist],
                  [-checkDist, checkDist], [checkDist, checkDist]
                ]) {
                  const sx = Math.round(cx + ox);
                  const sy = Math.round(cy + oy);
                  if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                    surroundBright += grayscale[sy * width + sx];
                    surroundCount++;
                  }
                }
                
                // A real marker has bright (paper) surroundings — mean > 150
                // A shadow/table edge has dark surroundings — mean < 120
                if (surroundCount > 0 && (surroundBright / surroundCount) < 120) {
                  continue; // Skip — this is probably a shadow or table edge
                }
              }
              
              bestDensity = density;
              bestX = x + mSize / 2;
              bestY = y + mSize / 2;
              bestSize = mSize;
            }
          }
        }
      }
      return { x: bestX, y: bestY, density: bestDensity, size: bestSize };
    };

    const cW = Math.floor(paperW * searchFraction);
    const cH = Math.floor(paperH * searchFraction);

    const tl = findMarkerInRegion(paperLeft, paperTop, paperLeft + cW, paperTop + cH);
    const tr = findMarkerInRegion(paperRight - cW, paperTop, paperRight, paperTop + cH);
    const bl = findMarkerInRegion(paperLeft, paperBottom - cH, paperLeft + cW, paperBottom);
    const br = findMarkerInRegion(paperRight - cW, paperBottom - cH, paperRight, paperBottom);

    console.log(`[OMR] Marker densities: TL=${tl.density.toFixed(2)} TR=${tr.density.toFixed(2)} BL=${bl.density.toFixed(2)} BR=${br.density.toFixed(2)}`);
    console.log(`[OMR] Marker positions: TL=(${Math.round(tl.x)},${Math.round(tl.y)}) TR=(${Math.round(tr.x)},${Math.round(tr.y)}) BL=(${Math.round(bl.x)},${Math.round(bl.y)}) BR=(${Math.round(br.x)},${Math.round(br.y)})`);

    // ── Step 3: Validate marker geometry ──
    const minDensityThreshold = 0.45;
    const densityOk = tl.density > minDensityThreshold && tr.density > minDensityThreshold &&
                      bl.density > minDensityThreshold && br.density > minDensityThreshold;
    
    if (densityOk) {
      // Check that the markers form a reasonable rectangle
      const topWidth = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
      const bottomWidth = Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2));
      const leftHeight = Math.sqrt(Math.pow(bl.x - tl.x, 2) + Math.pow(bl.y - tl.y, 2));
      const rightHeight = Math.sqrt(Math.pow(br.x - tr.x, 2) + Math.pow(br.y - tr.y, 2));
      
      // Top and bottom widths should be within 15% of each other
      const widthRatio = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth);
      // Left and right heights should be within 15% of each other
      const heightRatio = Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight);
      
      // Aspect ratio check: for A4 paper (210x297), markers span roughly 197x210mm
      // So width/height ≈ 0.94 for 100-item, ~0.85 for mini sheets
      const markerAspect = (topWidth + bottomWidth) / (leftHeight + rightHeight);
      
      const geometryOk = widthRatio > 0.85 && heightRatio > 0.85 && markerAspect > 0.5 && markerAspect < 2.0;
      
      console.log(`[OMR] Geometry: topW=${topWidth.toFixed(0)} botW=${bottomWidth.toFixed(0)} leftH=${leftHeight.toFixed(0)} rightH=${rightHeight.toFixed(0)} aspect=${markerAspect.toFixed(2)} widthRatio=${widthRatio.toFixed(2)} heightRatio=${heightRatio.toFixed(2)} ok=${geometryOk}`);
      
      return {
        found: geometryOk,
        topLeft: { x: tl.x, y: tl.y },
        topRight: { x: tr.x, y: tr.y },
        bottomLeft: { x: bl.x, y: bl.y },
        bottomRight: { x: br.x, y: br.y },
      };
    }
    
    console.log('[OMR] Marker density check failed, using fallback');
    return {
      found: false,
      topLeft: { x: tl.x, y: tl.y },
      topRight: { x: tr.x, y: tr.y },
      bottomLeft: { x: bl.x, y: bl.y },
      bottomRight: { x: br.x, y: br.y },
    };
  };

  // ─── COORDINATE MAPPING ───
  const mapToPixel = (
    markers: {
      topLeft: { x: number; y: number };
      topRight: { x: number; y: number };
      bottomLeft: { x: number; y: number };
      bottomRight: { x: number; y: number };
    },
    nx: number,
    ny: number
  ): { px: number; py: number } => {
    const topX = markers.topLeft.x + nx * (markers.topRight.x - markers.topLeft.x);
    const topY = markers.topLeft.y + nx * (markers.topRight.y - markers.topLeft.y);
    const botX = markers.bottomLeft.x + nx * (markers.bottomRight.x - markers.bottomLeft.x);
    const botY = markers.bottomLeft.y + nx * (markers.bottomRight.y - markers.bottomLeft.y);
    return {
      px: topX + ny * (botX - topX),
      py: topY + ny * (botY - topY),
    };
  };

  // ─── TEMPLATE LAYOUT DEFINITIONS ───
  interface AnswerBlock {
    startQ: number;
    endQ: number;
    firstBubbleNX: number;
    firstBubbleNY: number;
    bubbleSpacingNX: number;
    rowSpacingNY: number;
  }

  interface TemplateLayout {
    id: {
      firstColNX: number;
      firstRowNY: number;
      colSpacingNX: number;
      rowSpacingNY: number;
    };
    answerBlocks: AnswerBlock[];
    bubbleDiameterNX: number;
    bubbleDiameterNY: number;
  }

  const getTemplateLayout = (numQuestions: number): TemplateLayout => {
    const templateType = numQuestions <= 20 ? 20 : numQuestions <= 50 ? 50 : 100;

    if (templateType === 20) {
      // Mini sheet 105 × 148.5 mm
      // Marker centers: TL (7, 19)  BR (98, 126)  →  frame 91 × 107 mm
      const fw = 91, fh = 107;
      return {
        id: {
          firstColNX: 11 / fw,
          firstRowNY: 15 / fh,
          colSpacingNX: 4.5 / fw,
          rowSpacingNY: 3.5 / fh,
        },
        answerBlocks: [
          {
            startQ: 1, endQ: 10,
            firstBubbleNX: 13 / fw, firstBubbleNY: 58 / fh,
            bubbleSpacingNX: 4.8 / fw, rowSpacingNY: 4.5 / fh,
          },
          {
            startQ: 11, endQ: 20,
            firstBubbleNX: 55.5 / fw, firstBubbleNY: 58 / fh,
            bubbleSpacingNX: 4.8 / fw, rowSpacingNY: 4.5 / fh,
          },
        ],
        bubbleDiameterNX: 3.2 / fw,
        bubbleDiameterNY: 3.2 / fh,
      };
    }

    if (templateType === 50) {
      // Half-page sheet 105 × 297 mm
      // Marker centers: TL (7, 19)  BR (98, 230)  →  frame 91 × 211 mm
      const fw = 91, fh = 211;
      return {
        id: {
          firstColNX: 11 / fw,
          firstRowNY: 15 / fh,
          colSpacingNX: 4.5 / fw,
          rowSpacingNY: 3.5 / fh,
        },
        answerBlocks: [
          // Left column: Q1–10, Q11–20, Q21–30
          {
            startQ: 1, endQ: 10,
            firstBubbleNX: 13 / fw, firstBubbleNY: 58 / fh,
            bubbleSpacingNX: 4.8 / fw, rowSpacingNY: 4.5 / fh,
          },
          {
            startQ: 11, endQ: 20,
            firstBubbleNX: 13 / fw, firstBubbleNY: 110 / fh,
            bubbleSpacingNX: 4.8 / fw, rowSpacingNY: 4.5 / fh,
          },
          {
            startQ: 21, endQ: 30,
            firstBubbleNX: 13 / fw, firstBubbleNY: 162 / fh,
            bubbleSpacingNX: 4.8 / fw, rowSpacingNY: 4.5 / fh,
          },
          // Right column: Q31–40, Q41–50
          {
            startQ: 31, endQ: 40,
            firstBubbleNX: 55.5 / fw, firstBubbleNY: 58 / fh,
            bubbleSpacingNX: 4.8 / fw, rowSpacingNY: 4.5 / fh,
          },
          {
            startQ: 41, endQ: 50,
            firstBubbleNX: 55.5 / fw, firstBubbleNY: 110 / fh,
            bubbleSpacingNX: 4.8 / fw, rowSpacingNY: 4.5 / fh,
          },
        ],
        bubbleDiameterNX: 3.2 / fw,
        bubbleDiameterNY: 3.2 / fh,
      };
    }

    // 100‑question full page  210 × 297 mm
    //
    // PDF LAYOUT TRACE (with logo + exam code):
    //   Top markers: rect(3,3,7,7) & rect(200,3,7,7) → centers at (6.5, 6.5) & (203.5, 6.5)
    //   currentY = 12 → +logoSize(12)+4 = 28 → +examCode(5) = 33 → +Name/Date(5) = 38
    //   idTopY = 38, +7 → 45 (ID boxes), +idBoxH(5)+3 = 53 → idBubbleY = 53
    //   ID first bubble column: idStartX = 10(margin)+3(pad)+8(label) = 21
    //   ID bottom = 53 + 10*4.8 + 2 = 103, +4 → gridStartY = 107
    //   Grid row 0: by=107, header+4.5 → first bubble at 111.5
    //   Grid row 1: by=107+56=163, header+4.5 → first bubble at 167.5
    //   Row 1 last qY = 163 + 4.5 + 10*4.8 = 215.5
    //   bmY = 215.5 + 3 = 218.5 → bottom marker centers at (6.5, 222) & (203.5, 222)
    //
    //   fw = 203.5 - 6.5 = 197  ✓
    //   fh = 222 - 6.5 = 215.5
    //
    // All NY values are (pageY - 6.5) / fh
    // All NX values are (pageX - 6.5) / fw
    //
    // CALIBRATION: firstBubbleNX uses empirical xCorrection because PDF draws
    //   bubbles at bx + numW (numW=12mm), corrected with +5.0mm offset.
    const fw = 197, fh = 215.5;
    const xCorrection = 5.0;  // mm – empirical shift to align with actual bubble centers
    return {
      id: {
        // idStartX=21 page mm → (21 - 6.5) = 14.5 mm from TL marker center
        firstColNX: 14.5 / fw,
        // idBubbleY=53 page mm → (53 - 6.5) = 46.5 mm from TL marker center
        firstRowNY: 46.5 / fh,
        colSpacingNX: 4.5 / fw,
        rowSpacingNY: 4.8 / fh,
      },
      answerBlocks: [
        // Top row (beside ID section) — aligned to idBubbleY
        // First bubble at 53 + 4.5(header) = 57.5 → NY = (57.5 - 6.5) / fh = 51
        {
          startQ: 41, endQ: 50,
          firstBubbleNX: (83.35 + xCorrection) / fw,
          firstBubbleNY: 51 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 71, endQ: 80,
          firstBubbleNX: (148.85 + xCorrection) / fw,
          firstBubbleNY: 51 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        // Bottom grid – row 0: by=107, first bubble at 107+4.5=111.5 → NY = 105
        {
          startQ: 1, endQ: 10,
          firstBubbleNX: (20.36 + xCorrection) / fw,
          firstBubbleNY: 105 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 21, endQ: 30,
          firstBubbleNX: (64.52 + xCorrection) / fw,
          firstBubbleNY: 105 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 51, endQ: 60,
          firstBubbleNX: (108.68 + xCorrection) / fw,
          firstBubbleNY: 105 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 81, endQ: 90,
          firstBubbleNX: (152.84 + xCorrection) / fw,
          firstBubbleNY: 105 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        // Bottom grid – row 1: by=163, first bubble at 163+4.5=167.5 → NY = 161
        {
          startQ: 11, endQ: 20,
          firstBubbleNX: (20.36 + xCorrection) / fw,
          firstBubbleNY: 161 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 31, endQ: 40,
          firstBubbleNX: (64.52 + xCorrection) / fw,
          firstBubbleNY: 161 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 61, endQ: 70,
          firstBubbleNX: (108.68 + xCorrection) / fw,
          firstBubbleNY: 161 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 91, endQ: 100,
          firstBubbleNX: (152.84 + xCorrection) / fw,
          firstBubbleNY: 161 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
      ],
      bubbleDiameterNX: 3.8 / fw,
      bubbleDiameterNY: 3.8 / fh,
    };
  };

  // ─── MAIN DETECTION PIPELINE ───
  const detectBubbles = async (
    imageData: ImageData,
    numQuestions: number,
    choicesPerQuestion: number
  ): Promise<{ studentId: string; answers: string[]; multipleAnswers: number[]; idDoubleShades: number[] }> => {
    const { data, width, height } = imageData;

    // 1. Convert to grayscale
    const rawGrayscale = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      rawGrayscale[i / 4] = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      );
    }

    // 1b. Contrast normalization — stretches the histogram to use the full 0-255 range
    // This helps when the image has poor lighting (shadows, dim environment)
    let gMin = 255, gMax = 0;
    // Sample to find the 2nd and 98th percentile (robust to extreme outliers)
    const sortSample: number[] = [];
    const sampleStep = Math.max(1, Math.floor(rawGrayscale.length / 10000));
    for (let i = 0; i < rawGrayscale.length; i += sampleStep) {
      sortSample.push(rawGrayscale[i]);
    }
    sortSample.sort((a, b) => a - b);
    gMin = sortSample[Math.floor(sortSample.length * 0.02)];
    gMax = sortSample[Math.floor(sortSample.length * 0.98)];
    const gRange = Math.max(1, gMax - gMin);

    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < rawGrayscale.length; i++) {
      grayscale[i] = Math.max(0, Math.min(255, Math.round(((rawGrayscale[i] - gMin) / gRange) * 255)));
    }
    console.log(`[OMR] Contrast normalization: min=${gMin} max=${gMax} range=${gRange}`);

    // 2. Compute integral image for fast adaptive thresholding
    const integral = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        rowSum += grayscale[y * width + x];
        integral[y * width + x] = rowSum + (y > 0 ? integral[(y - 1) * width + x] : 0);
      }
    }

    // 3. Adaptive threshold using integral image
    const globalThreshold = calculateOtsuThreshold(grayscale);
    const binary = new Uint8Array(width * height);
    const halfBlock = Math.max(8, Math.floor(Math.min(width, height) / 40));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - halfBlock);
        const y1 = Math.max(0, y - halfBlock);
        const x2 = Math.min(width - 1, x + halfBlock);
        const y2 = Math.min(height - 1, y + halfBlock);

        let sum = integral[y2 * width + x2];
        if (x1 > 0) sum -= integral[y2 * width + (x1 - 1)];
        if (y1 > 0) sum -= integral[(y1 - 1) * width + x2];
        if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * width + (x1 - 1)];

        const area = (x2 - x1 + 1) * (y2 - y1 + 1);
        const localMean = sum / area;
        const threshold = Math.min(globalThreshold, localMean - 8);
        binary[y * width + x] = grayscale[y * width + x] < threshold ? 1 : 0;
      }
    }

    // 4. Find corner alignment markers (use binary + grayscale for robust detection)
    const markers = findCornerMarkers(binary, width, height, grayscale);
    console.log('[OMR] Corner markers found:', markers.found,
      'TL:', Math.round(markers.topLeft.x), Math.round(markers.topLeft.y),
      'BR:', Math.round(markers.bottomRight.x), Math.round(markers.bottomRight.y));

    // 5. Fallback: use image bounds with margin appropriate to the template
    // For 100-item, the paper fills most of the cropped image, so use tighter margins
    const templateType = numQuestions <= 20 ? 20 : numQuestions <= 50 ? 50 : 100;
    const fallbackMargin = templateType === 100 ? 0.04 : 0.02;
    const effectiveMarkers = markers.found
      ? markers
      : {
          topLeft: { x: width * fallbackMargin, y: height * fallbackMargin },
          topRight: { x: width * (1 - fallbackMargin), y: height * fallbackMargin },
          bottomLeft: { x: width * fallbackMargin, y: height * (1 - fallbackMargin) },
          bottomRight: { x: width * (1 - fallbackMargin), y: height * (1 - fallbackMargin) },
        };

    // 6. Get template layout for this exam's question count
    const layout = getTemplateLayout(numQuestions);

    // 7. Detect student ID and answers using GRAYSCALE (not binary) for bubble sampling
    const { studentId, doubleShadeColumns } = detectStudentIdFromImage(grayscale, width, height, effectiveMarkers, layout);
    const { answers, multipleAnswers } = detectAnswersFromImage(
      grayscale, width, height, effectiveMarkers, layout, numQuestions, choicesPerQuestion
    );

    return { studentId, answers, multipleAnswers, idDoubleShades: doubleShadeColumns };
  };

  // ─── OTSU'S THRESHOLD ───
  const calculateOtsuThreshold = (grayscale: Uint8Array): number => {
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < grayscale.length; i++) histogram[grayscale[i]]++;
    const total = grayscale.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > maxVar) { maxVar = v; threshold = t; }
    }
    return threshold;
  };

  // ─── BUBBLE SAMPLING (grayscale-based) ───
  // Returns a score where HIGHER = MORE FILLED (darker bubble relative to surroundings)
  const sampleBubbleAt = (
    grayscale: Uint8Array,
    imgW: number,
    imgH: number,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number
  ): number => {
    // Sample the inner area of the bubble (the part that gets filled in)
    // Use inner 50% to safely avoid the printed circle outline
    let innerSum = 0, innerCount = 0;
    const innerRX = radiusX * 0.50;
    const innerRY = radiusY * 0.50;
    const step = Math.max(1, Math.floor(Math.min(innerRX, innerRY) / 4));

    for (let dy = -Math.floor(innerRY); dy <= Math.floor(innerRY); dy += step) {
      for (let dx = -Math.floor(innerRX); dx <= Math.floor(innerRX); dx += step) {
        if (innerRX > 0 && innerRY > 0 && (dx * dx) / (innerRX * innerRX) + (dy * dy) / (innerRY * innerRY) > 1) continue;
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
          innerSum += grayscale[py * imgW + px];
          innerCount++;
        }
      }
    }

    // Sample the surrounding paper area — use specific spots above and below the bubble
    // to avoid accidentally sampling adjacent bubbles in the same row.
    // On a 100-item template, horizontal spacing is tight (5mm between centers, 3.8mm diameter)
    // so we sample primarily above/below where there's row gap space.
    let outerSum = 0, outerCount = 0;
    
    // Sample 4 spots: above, below, and two diagonal spots
    const spotOffsets = [
      { dx: 0, dy: -(radiusY * 1.6) },    // above
      { dx: 0, dy: (radiusY * 1.6) },     // below
      { dx: -(radiusX * 1.4), dy: -(radiusY * 1.0) }, // upper-left diagonal
      { dx: (radiusX * 1.4), dy: -(radiusY * 1.0) },  // upper-right diagonal
      { dx: -(radiusX * 1.4), dy: (radiusY * 1.0) },  // lower-left diagonal
      { dx: (radiusX * 1.4), dy: (radiusY * 1.0) },   // lower-right diagonal
    ];
    
    for (const spot of spotOffsets) {
      // Sample a small patch around each spot
      const spotR = Math.max(2, Math.floor(Math.min(radiusX, radiusY) * 0.3));
      for (let dy = -spotR; dy <= spotR; dy += Math.max(1, spotR)) {
        for (let dx = -spotR; dx <= spotR; dx += Math.max(1, spotR)) {
          const px = Math.round(cx + spot.dx + dx);
          const py = Math.round(cy + spot.dy + dy);
          if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
            outerSum += grayscale[py * imgW + px];
            outerCount++;
          }
        }
      }
    }

    if (innerCount === 0) return 0;

    const innerMean = innerSum / innerCount;
    const outerMean = outerCount > 0 ? outerSum / outerCount : 200; // assume light background

    // Score = how much darker the inner area is compared to the surroundings
    // A filled bubble (pencil mark) will be much darker than the paper around it
    // An empty bubble outline will be only slightly darker
    // Normalize: 0 = same brightness as surroundings, 1 = very dark relative to surroundings
    if (outerMean <= 10) return 0; // avoid division issues in very dark images
    const contrast = (outerMean - innerMean) / outerMean;
    return Math.max(0, contrast);
  };

  // ─── DETECT STUDENT ID ───
  const detectStudentIdFromImage = (
    grayscale: Uint8Array,
    width: number,
    height: number,
    markers: {
      topLeft: { x: number; y: number };
      topRight: { x: number; y: number };
      bottomLeft: { x: number; y: number };
      bottomRight: { x: number; y: number };
    },
    layout: TemplateLayout
  ): { studentId: string; doubleShadeColumns: number[] } => {
    const { id } = layout;
    const idDigits: number[] = [];
    const doubleShadeColumns: number[] = [];

    const frameW = markers.topRight.x - markers.topLeft.x;
    const frameH = markers.bottomLeft.y - markers.topLeft.y;
    const bubbleRX = (layout.bubbleDiameterNX * frameW) / 2;
    const bubbleRY = (layout.bubbleDiameterNY * frameH) / 2;

    // Use smaller radius for ID bubbles (they are 3.5mm vs 3.8mm for answers)
    const idBubbleRX = bubbleRX * (3.5 / 3.8);
    const idBubbleRY = bubbleRY * (3.5 / 3.8);

    console.log('[ID] BubbleR:', idBubbleRX.toFixed(1), 'x', idBubbleRY.toFixed(1));

    // Grayscale contrast thresholds
    const ID_FILL_THRESHOLD = 0.15;
    const ID_DOUBLE_SHADE_RATIO = 0.65;

    for (let col = 0; col < 10; col++) {
      let maxFill = 0;
      let detectedDigit = 0;
      let hasDetection = false;
      const fills: number[] = [];

      for (let row = 0; row < 10; row++) {
        const nx = id.firstColNX + col * id.colSpacingNX;
        const ny = id.firstRowNY + row * id.rowSpacingNY;
        const { px, py } = mapToPixel(markers, nx, ny);

        const fill = sampleBubbleAt(grayscale, width, height, px, py, idBubbleRX, idBubbleRY);
        fills.push(fill);
        if (fill > maxFill && fill > ID_FILL_THRESHOLD) {
          maxFill = fill;
          detectedDigit = row;
          hasDetection = true;
        }
      }

      // Check for double-shade
      if (maxFill > ID_FILL_THRESHOLD) {
        const filledCount = fills.filter(
          f => f > ID_FILL_THRESHOLD && f >= maxFill * ID_DOUBLE_SHADE_RATIO
        ).length;
        if (filledCount > 1) {
          doubleShadeColumns.push(col + 1);
          console.log(`[ID] ⚠️ Col ${col} has DOUBLE SHADE (${filledCount} bubbles filled)`);
        }
      }

      console.log(`[ID] Col ${col}: fills=[${fills.map(f => f.toFixed(3)).join(',')}] → ${hasDetection ? detectedDigit : '?'} (max=${maxFill.toFixed(3)})`);
      idDigits.push(hasDetection ? detectedDigit : 0);
    }

    const raw = idDigits.join('');
    console.log('[ID] Raw digits:', raw, doubleShadeColumns.length > 0 ? `(double-shade in columns: ${doubleShadeColumns.join(',')})` : '');
    return { studentId: raw, doubleShadeColumns };
  };

  // ─── DETECT ANSWERS ───
  const detectAnswersFromImage = (
    grayscale: Uint8Array,
    width: number,
    height: number,
    markers: {
      topLeft: { x: number; y: number };
      topRight: { x: number; y: number };
      bottomLeft: { x: number; y: number };
      bottomRight: { x: number; y: number };
    },
    layout: TemplateLayout,
    numQuestions: number,
    choicesPerQuestion: number
  ): { answers: string[]; multipleAnswers: number[] } => {
    const answers = new Array<string>(numQuestions).fill('');
    const multipleAnswers: number[] = [];
    const choiceLabels = 'ABCDEFGH'.slice(0, choicesPerQuestion).split('');

    const frameW = markers.topRight.x - markers.topLeft.x;
    const frameH = markers.bottomLeft.y - markers.topLeft.y;
    const bubbleRX = (layout.bubbleDiameterNX * frameW) / 2;
    const bubbleRY = (layout.bubbleDiameterNY * frameH) / 2;

    // Grayscale contrast thresholds
    // A filled pencil bubble has contrast ~0.25–0.60
    // An empty bubble (printed outline only) has contrast ~0.02–0.10
    const FILL_THRESHOLD = 0.15;
    // A second bubble must be at least 70% as dark as the darkest to count as double-shade
    const MULTI_ANSWER_RATIO = 0.70;

    console.log(`[ANS] Frame: ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR: ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px`);

    for (const block of layout.answerBlocks) {
      // Log the pixel position of the first bubble in each block for debugging
      const firstNX = block.firstBubbleNX;
      const firstNY = block.firstBubbleNY;
      const firstPx = mapToPixel(markers, firstNX, firstNY);
      console.log(`[ANS] Block Q${block.startQ}-${block.endQ}: firstBubble at nx=${firstNX.toFixed(4)} ny=${firstNY.toFixed(4)} → px=(${Math.round(firstPx.px)},${Math.round(firstPx.py)})`);

      for (let q = block.startQ; q <= block.endQ && q <= numQuestions; q++) {
        const qIndex = q - 1;
        const rowInBlock = q - block.startQ;

        let maxFill = 0;
        let selectedChoice = '';
        const fills: { choice: string; fill: number }[] = [];

        for (let c = 0; c < choicesPerQuestion; c++) {
          const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
          const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
          const { px, py } = mapToPixel(markers, nx, ny);

          const fill = sampleBubbleAt(grayscale, width, height, px, py, bubbleRX, bubbleRY);
          fills.push({ choice: choiceLabels[c], fill });
          if (fill > maxFill && fill > FILL_THRESHOLD) {
            maxFill = fill;
            selectedChoice = choiceLabels[c];
          }
        }

        // Additional check: the winner must stand out clearly from the rest
        // Sort fills descending to compare 1st vs 2nd
        const sortedFills = [...fills].sort((a, b) => b.fill - a.fill);
        if (maxFill > FILL_THRESHOLD && sortedFills.length >= 2) {
          const secondFill = sortedFills[1].fill;
          // If second-highest is very close to max, flag as multiple answer
          if (secondFill > FILL_THRESHOLD && secondFill >= maxFill * MULTI_ANSWER_RATIO) {
            multipleAnswers.push(q);
            console.log(`[MULTI] Q${q}: ${sortedFills.slice(0, 3).map(f => `${f.choice}=${f.fill.toFixed(3)}`).join(', ')}`);
          }
        }

        // Log first few questions for debugging
        if (q <= 5 || (q % 10 === 1)) {
          console.log(`[ANS] Q${q}: ${fills.map(f => `${f.choice}=${f.fill.toFixed(3)}`).join(', ')} → ${selectedChoice || '?'}`);
        }

        answers[qIndex] = selectedChoice;
      }
    }
    return { answers, multipleAnswers };
  };

  // Calculate letter grade
  const calculateLetterGrade = (percentage: number): string => {
    if (percentage >= 90) return 'A';
    if (percentage >= 85) return 'A-';
    if (percentage >= 80) return 'B+';
    if (percentage >= 75) return 'B';
    if (percentage >= 70) return 'C+';
    if (percentage >= 65) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  };

  // Get grade color
  const getGradeColor = (grade: string): string => {
    if (grade.startsWith('A')) return 'text-green-600 bg-green-100';
    if (grade.startsWith('B')) return 'text-lime-600 bg-lime-100';
    if (grade.startsWith('C')) return 'text-yellow-600 bg-yellow-100';
    if (grade.startsWith('D')) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  // Save scan result
  const saveScanResult = async () => {
    if (!scanResult || !user || !exam) return;

    // Block saving if student ID has errors
    if (studentIdError) {
      toast.error('Cannot save: Student ID is not registered in this class. Please correct the Student ID first.');
      return;
    }
    if (idDoubleShadeColumns.length > 0) {
      toast.error('Cannot save: Student ID has columns with multiple bubbles shaded. Please correct the Student ID first.');
      return;
    }

    // Block saving if no class is linked or student is not in the class
    if (!classData) {
      toast.error('Cannot save: No class is linked to this exam. Please assign a class to the exam first.');
      setStudentIdError('No class is linked to this exam. Please go to exam settings and assign a class before scanning.');
      return;
    }

    const student = classData.students.find(s => s.student_id === detectedStudentId);
    if (!student) {
      toast.error(`Cannot save: Student ID "${detectedStudentId}" is not registered in class "${classData.class_name} - ${classData.section_block}".`);
      setStudentIdError(`Student ID "${detectedStudentId}" is not registered in class "${classData.class_name} - ${classData.section_block}". Please verify the student is enrolled in this class.`);
      return;
    }
    
    setSaving(true);
    try {
      const isNullId = !detectedStudentId || detectedStudentId === '0000000000';
      
      const result = await ScanningService.saveScannedResult(
        examId,
        detectedStudentId || `NULL_${Date.now()}`,
        detectedAnswers as AnswerChoice[],
        answerKey,
        user.id,
        isNullId,
        exam.choicePoints
      );
      
      if (result.success) {
        toast.success('Scan saved successfully!');
        setRecentScans(prev => [scanResult, ...prev.slice(0, 9)]);
        
        // Reset for next scan
        setScanResult(null);
        setDetectedAnswers([]);
        setDetectedStudentId('');
        setMatchedStudent(null);
        setStudentIdError(null);
        setMultipleAnswerQuestions([]);
        setIdDoubleShadeColumns([]);
        setCapturedImage(null);
        setMode('select');
      } else {
        toast.error(result.error || 'Failed to save scan');
      }
    } catch (error) {
      console.error('Error saving scan:', error);
      toast.error('Failed to save scan result');
    } finally {
      setSaving(false);
    }
  };

  // Edit detected answer
  const editAnswer = (index: number, newValue: string) => {
    const upper = newValue.toUpperCase();
    if (upper.length <= 1 && /^[A-Z]?$/.test(upper)) {
      const choiceLimit = String.fromCharCode(64 + (exam?.choices_per_item || 4));
      if (!upper || upper <= choiceLimit) {
        const newAnswers = [...detectedAnswers];
        newAnswers[index] = upper;
        setDetectedAnswers(newAnswers);
        
        // Recalculate score
        let score = 0;
        const totalQuestions = Math.min(newAnswers.length, answerKey.length);
        for (let i = 0; i < totalQuestions; i++) {
          if (newAnswers[i] && answerKey[i] && newAnswers[i].toUpperCase() === answerKey[i].toUpperCase()) {
            score++;
          }
        }
        const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
        
        setScanResult(prev => prev ? {
          ...prev,
          answers: newAnswers,
          score,
          percentage,
          letterGrade: calculateLetterGrade(percentage)
        } : null);
      }
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-[#1a472a] mx-auto" />
          <p className="text-gray-600">Loading scanner...</p>
        </div>
      </div>
    );
  }

  // No exam found
  if (!exam) {
    return (
      <div className="space-y-6">
        <Link href="/exams" className="inline-flex items-center gap-2 text-gray-600 hover:text-[#1a472a]">
          <ArrowLeft className="w-5 h-5" />
          Back to Exams
        </Link>
        <Card className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Exam Not Found</h2>
          <p className="text-gray-600 mt-2">The exam you're looking for doesn't exist.</p>
        </Card>
      </div>
    );
  }

  // No answer key
  if (answerKey.length === 0) {
    return (
      <div className="space-y-6">
        <Link href={`/exams/${examId}`} className="inline-flex items-center gap-2 text-gray-600 hover:text-[#1a472a]">
          <ArrowLeft className="w-5 h-5" />
          Back to Exam
        </Link>
        <Card className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Answer Key Required</h2>
          <p className="text-gray-600 mt-2">Please set up the answer key before scanning papers.</p>
          <Link href={`/exams/${examId}/edit-key`}>
            <Button className="mt-4 bg-[#1a472a] hover:bg-[#2d6b47]">
              Set Up Answer Key
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/exams/${examId}`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[#1a472a]">Scan Answer Sheets</h1>
            <p className="text-gray-600">{exam.title} • {exam.num_items} questions</p>
          </div>
        </div>
        {recentScans.length > 0 && (
          <div className="text-sm text-gray-600">
            <CheckCircle className="w-4 h-4 inline mr-1 text-green-600" />
            {recentScans.length} scanned this session
          </div>
        )}
      </div>

      {/* Mode: Select */}
      {mode === 'select' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card 
            className="p-8 border-2 border-dashed hover:border-[#1a472a] cursor-pointer transition-all hover:shadow-lg"
            onClick={startCamera}
          >
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera className="w-10 h-10 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Use Camera</h3>
              <p className="text-gray-600 mt-2">
                Capture answer sheet using your device camera
              </p>
            </div>
          </Card>

          <Card 
            className="p-8 border-2 border-dashed hover:border-[#1a472a] cursor-pointer transition-all hover:shadow-lg"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Upload Image</h3>
              <p className="text-gray-600 mt-2">
                Select an image file from your device
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </Card>
        </div>
      )}

      {/* Mode: Camera */}
      {mode === 'camera' && (
        <Card className="overflow-hidden">
          {/* 
            Camera container: always use the native video stream aspect ratio.
            The guide overlay inside adapts its shape to match the paper template.
          */}
          <div className="relative bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-auto block"
            />
            {/* Camera overlay guide — adapts to template */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Semi-transparent overlay around the guide */}
              {(() => {
                const t = getTemplateType();
                // Paper aspect ratios (width:height)
                // 20-item: 105 x 148.5mm  → ~0.707
                // 50-item: 105 x 297mm    → ~0.354
                // 100-item: 210 x 297mm   → ~0.707
                // Guide occupies most of the view, with padding
                const guideStyle = t === 20
                  ? { width: '75%', aspectRatio: '105 / 148.5' }   // landscape-ish small card
                  : t === 50
                  ? { width: '55%', aspectRatio: '105 / 297' }     // tall narrow
                  : { width: '90%', aspectRatio: '210 / 297' };    // A4 portrait — tight fit to minimize background
                const label = t === 20
                  ? 'Align answer sheet within the frame'
                  : t === 50
                  ? `Align ${t}-item sheet within the frame`
                  : 'Fill the frame with the paper — edges close to border';
                return (
                  <div className="relative" style={guideStyle}>
                    <div className="absolute inset-0 border-2 border-white/60 rounded-lg" />
                    {/* Corner brackets */}
                    <div className="absolute top-1 left-1 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl" />
                    <div className="absolute top-1 right-1 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr" />
                    <div className="absolute bottom-1 left-1 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl" />
                    <div className="absolute bottom-1 right-1 w-6 h-6 border-b-2 border-r-2 border-white rounded-br" />
                    {/* Label */}
                    <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-white text-xs bg-black/60 px-3 py-1.5 rounded-full">
                      {label}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="p-4 flex justify-center gap-4">
            <Button variant="outline" onClick={stopCamera}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={capturePhoto} className="bg-[#1a472a] hover:bg-[#2d6b47]">
              <Camera className="w-4 h-4 mr-2" />
              Capture
            </Button>
          </div>
        </Card>
      )}

      {/* Mode: Review */}
      {mode === 'review' && capturedImage && (
        <Card className="overflow-hidden">
          <div className="relative bg-gray-100">
            <img 
              src={capturedImage} 
              alt="Captured answer sheet"
              className="w-full max-h-[60vh] object-contain mx-auto"
            />
          </div>
          <div className="p-4 flex justify-center gap-4">
            <Button variant="outline" onClick={() => {
              setCapturedImage(null);
              setMode('select');
            }}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Retake
            </Button>
            <Button onClick={processImage} className="bg-[#1a472a] hover:bg-[#2d6b47]">
              <Scan className="w-4 h-4 mr-2" />
              Process & Grade
            </Button>
          </div>
        </Card>
      )}

      {/* Mode: Processing */}
      {mode === 'processing' && (
        <Card className="p-12 text-center">
          <div className="space-y-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Scanning Document</h3>
              <p className="text-gray-600 mt-2">
                Straightening paper, enhancing image, and reading bubbles...
              </p>
            </div>
            <div className="max-w-xs mx-auto space-y-2">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#1a472a] rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-xs text-gray-400">Auto perspective correction • Contrast enhancement • OMR detection</p>
            </div>
          </div>
        </Card>
      )}

      {/* Mode: Results */}
      {mode === 'results' && scanResult && (
        <div className="space-y-6">
          {/* Student ID Double Shade Error */}
          {idDoubleShadeColumns.length > 0 && (
            <Card className="p-4 border-orange-300 bg-orange-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-orange-800">Multiple Bubbles Shaded in Student ID</h4>
                  <p className="text-sm text-orange-700 mt-1">
                    Column(s) <strong>{idDoubleShadeColumns.join(', ')}</strong> of the Student ID have more than one bubble shaded. Each column must have only <strong>one digit</strong> selected.
                  </p>
                  <p className="text-xs text-orange-600 mt-2">
                    Please ask the student to properly shade only one bubble per column, or manually correct the Student ID below.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Student ID Not Found Error */}
          {studentIdError && idDoubleShadeColumns.length === 0 && (
            <Card className="p-4 border-red-300 bg-red-50">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-800">Student ID Not Found</h4>
                  <p className="text-sm text-red-700 mt-1">{studentIdError}</p>
                  <p className="text-xs text-red-600 mt-2">
                    You must correct the Student ID before saving. Edit the ID field below or discard and re-scan.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Multiple Answers Warning */}
          {multipleAnswerQuestions.length > 0 && (
            <Card className="p-4 border-yellow-300 bg-yellow-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-yellow-800">Multiple Answers Detected</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    The following question(s) have more than one bubble shaded: <strong>
                    {multipleAnswerQuestions.map(q => `#${q}`).join(', ')}
                    </strong>
                  </p>
                  <p className="text-xs text-yellow-600 mt-2">
                    Only one answer per question is allowed. The system selected the darkest bubble, but please verify and correct if needed. Remind the student to shade only one bubble per question.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Score Summary */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  (studentIdError || idDoubleShadeColumns.length > 0) ? 'bg-red-100' : matchedStudent ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <User className={`w-8 h-8 ${
                    (studentIdError || idDoubleShadeColumns.length > 0) ? 'text-red-600' : matchedStudent ? 'text-green-600' : 'text-gray-600'
                  }`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={detectedStudentId}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setDetectedStudentId(newId);
                        // Clear double-shade error when user manually edits
                        setIdDoubleShadeColumns([]);
                        // Re-validate student ID on change
                        if (!newId || /^0+$/.test(newId)) {
                          setStudentIdError('No Student ID provided. Please enter a valid Student ID.');
                          setMatchedStudent(null);
                        } else if (!classData) {
                          setStudentIdError('No class is linked to this exam. Please go to exam settings and assign a class before scanning.');
                          setMatchedStudent(null);
                        } else {
                          const student = classData.students.find(s => s.student_id === newId);
                          if (student) {
                            setMatchedStudent(student);
                            setStudentIdError(null);
                          } else {
                            setMatchedStudent(null);
                            setStudentIdError(`Student ID "${newId}" is not registered in class "${classData.class_name} - ${classData.section_block}". Please verify the student is enrolled in this class or check if the ID was shaded correctly.`);
                          }
                        }
                      }}
                      className={`text-xl font-bold bg-transparent border-b transition-colors focus:outline-none ${
                        (studentIdError || idDoubleShadeColumns.length > 0)
                          ? 'text-red-700 border-red-300 hover:border-red-400 focus:border-red-500'
                          : 'text-gray-900 border-transparent hover:border-gray-300 focus:border-[#1a472a]'
                      }`}
                      placeholder="Enter Student ID"
                    />
                    {matchedStudent && (
                      <span className="text-sm text-green-600 bg-green-100 px-2 py-1 rounded">
                        {matchedStudent.first_name} {matchedStudent.last_name}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600">Student ID</p>
                </div>
              </div>
              <div className="text-right">
                <div className={`inline-block px-4 py-2 rounded-lg text-2xl font-bold ${getGradeColor(scanResult.letterGrade)}`}>
                  {scanResult.letterGrade}
                </div>
                <p className="text-gray-600 mt-1">
                  {scanResult.score}/{scanResult.totalQuestions} ({scanResult.percentage}%)
                </p>
              </div>
            </div>
          </Card>

          {/* Answer Comparison */}
          <Card className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Answer Comparison</h3>
            
            {(() => {
              const halfPoint = Math.ceil(detectedAnswers.length / 2);
              const firstRow = detectedAnswers.slice(0, halfPoint);
              const secondRow = detectedAnswers.slice(halfPoint);
              
              return (
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Questions 1-{halfPoint}</p>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
                      {firstRow.map((answer, i) => {
                        const isCorrect = answerKey[i] && answer.toUpperCase() === answerKey[i].toUpperCase();
                        const hasMultiple = multipleAnswerQuestions.includes(i + 1);
                        return (
                          <div key={i} className="text-center">
                            <span className={`text-xs block mb-1 ${hasMultiple ? 'text-yellow-600 font-bold' : 'text-gray-500'}`}>{i + 1}</span>
                            <div className="relative">
                              <input
                                type="text"
                                value={answer}
                                onChange={(e) => editAnswer(i, e.target.value)}
                                maxLength={1}
                                className={`w-10 h-10 text-center font-bold rounded-lg border-2 transition-colors ${
                                  hasMultiple
                                    ? 'border-yellow-500 bg-yellow-50 text-yellow-700 ring-2 ring-yellow-300'
                                    : isCorrect 
                                      ? 'border-green-500 bg-green-50 text-green-700' 
                                      : answer 
                                        ? 'border-red-500 bg-red-50 text-red-700'
                                        : 'border-gray-300 bg-gray-50 text-gray-500'
                                }`}
                              />
                              {hasMultiple && (
                                <AlertTriangle className="absolute -top-2 -right-2 w-4 h-4 text-yellow-600" />
                              )}
                              {answerKey[i] && !isCorrect && (
                                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-green-600 font-medium">
                                  {answerKey[i]}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {secondRow.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm font-medium text-gray-500 mb-2">Questions {halfPoint + 1}-{detectedAnswers.length}</p>
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
                        {secondRow.map((answer, i) => {
                          const actualIndex = halfPoint + i;
                          const isCorrect = answerKey[actualIndex] && answer.toUpperCase() === answerKey[actualIndex].toUpperCase();
                          const hasMultiple = multipleAnswerQuestions.includes(actualIndex + 1);
                          return (
                            <div key={actualIndex} className="text-center">
                              <span className={`text-xs block mb-1 ${hasMultiple ? 'text-yellow-600 font-bold' : 'text-gray-500'}`}>{actualIndex + 1}</span>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={answer}
                                  onChange={(e) => editAnswer(actualIndex, e.target.value)}
                                  maxLength={1}
                                  className={`w-10 h-10 text-center font-bold rounded-lg border-2 transition-colors ${
                                    hasMultiple
                                      ? 'border-yellow-500 bg-yellow-50 text-yellow-700 ring-2 ring-yellow-300'
                                      : isCorrect 
                                        ? 'border-green-500 bg-green-50 text-green-700' 
                                        : answer 
                                          ? 'border-red-500 bg-red-50 text-red-700'
                                          : 'border-gray-300 bg-gray-50 text-gray-500'
                                  }`}
                                />
                                {hasMultiple && (
                                  <AlertTriangle className="absolute -top-2 -right-2 w-4 h-4 text-yellow-600" />
                                )}
                                {answerKey[actualIndex] && !isCorrect && (
                                  <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-green-600 font-medium">
                                    {answerKey[actualIndex]}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex items-center gap-4 mt-6 pt-4 border-t text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded" />
                <span className="text-gray-600">Correct</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-100 border-2 border-red-500 rounded" />
                <span className="text-gray-600">Incorrect (correct answer shown below)</span>
              </div>
              {multipleAnswerQuestions.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-100 border-2 border-yellow-500 rounded relative">
                    <AlertTriangle className="absolute -top-1 -right-1 w-3 h-3 text-yellow-600" />
                  </div>
                  <span className="text-yellow-700">Multiple answers detected</span>
                </div>
              )}
            </div>
          </Card>

          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={() => {
              setScanResult(null);
              setDetectedAnswers([]);
              setDetectedStudentId('');
              setMatchedStudent(null);
              setStudentIdError(null);
              setMultipleAnswerQuestions([]);
              setIdDoubleShadeColumns([]);
              setCapturedImage(null);
              setMode('select');
            }}>
              <X className="w-4 h-4 mr-2" />
              Discard & Scan Again
            </Button>
            <Button 
              onClick={() => {
                if (idDoubleShadeColumns.length > 0) {
                  toast.error('Student ID has multiple bubbles shaded. Please correct the ID before saving.');
                  return;
                }
                if (studentIdError) {
                  toast.error('Please correct the Student ID before saving. The student must be registered in this class.');
                  return;
                }
                saveScanResult();
              }}
              disabled={saving || !!studentIdError || idDoubleShadeColumns.length > 0}
              className={`${(studentIdError || idDoubleShadeColumns.length > 0) ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#1a472a] hover:bg-[#2d6b47]'}`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Result
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Recent Scans */}
      {recentScans.length > 0 && mode === 'select' && (
        <Card className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Scans This Session</h3>
          <div className="space-y-2">
            {recentScans.map((scan, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium">{scan.studentId}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-gray-600">{scan.score}/{scan.totalQuestions}</span>
                  <span className={`px-2 py-1 rounded text-sm font-bold ${getGradeColor(scan.letterGrade)}`}>
                    {scan.letterGrade}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Hidden canvases for processing */}
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={processingCanvasRef} className="hidden" />
    </div>
  );
}