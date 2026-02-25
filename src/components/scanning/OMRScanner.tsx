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

  // ─── IMAGE ENHANCEMENT: Adaptive brightness (no perspective warp) ───
  // Normalizes lighting across the image to handle shadows and uneven illumination.
  // Does NOT warp or distort the image — perspective correction is handled by
  // the 4-corner marker system in detectBubbles.
  const enhanceImage = (srcCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = srcCanvas.getContext('2d');
    if (!ctx) return srcCanvas;
    
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    
    // Work on a copy so we don't mutate the source
    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return srcCanvas;
    outCtx.drawImage(srcCanvas, 0, 0);
    
    const imgData = outCtx.getImageData(0, 0, w, h);
    const d = imgData.data;
    
    // Adaptive brightness enhancement using a local grid
    // Each grid cell finds the local "paper white" level and scales up so paper → 245
    const gridSize = 48; // larger grid = smoother transitions between cells
    const gW = Math.ceil(w / gridSize);
    const gH = Math.ceil(h / gridSize);
    const gridWhite = new Float32Array(gW * gH);
    
    for (let gy = 0; gy < gH; gy++) {
      for (let gx = 0; gx < gW; gx++) {
        const samples: number[] = [];
        const y1 = gy * gridSize, y2 = Math.min(h, (gy + 1) * gridSize);
        const x1 = gx * gridSize, x2 = Math.min(w, (gx + 1) * gridSize);
        for (let py = y1; py < y2; py += 3) {
          for (let px = x1; px < x2; px += 3) {
            const i = (py * w + px) * 4;
            samples.push(Math.max(d[i], d[i + 1], d[i + 2]));
          }
        }
        samples.sort((a, b) => a - b);
        // Use 85th percentile as "local paper white" (avoids being pulled up by specular highlights)
        gridWhite[gy * gW + gx] = samples.length > 0 ? samples[Math.floor(samples.length * 0.85)] : 200;
      }
    }
    
    // Apply with bilinear interpolation between grid cells for smooth result
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        // Find the four surrounding grid cells and interpolate
        const gxf = px / gridSize - 0.5;
        const gyf = py / gridSize - 0.5;
        const gx0 = Math.max(0, Math.floor(gxf));
        const gy0 = Math.max(0, Math.floor(gyf));
        const gx1 = Math.min(gW - 1, gx0 + 1);
        const gy1 = Math.min(gH - 1, gy0 + 1);
        const fx = Math.max(0, Math.min(1, gxf - gx0));
        const fy = Math.max(0, Math.min(1, gyf - gy0));
        
        const w00 = gridWhite[gy0 * gW + gx0];
        const w10 = gridWhite[gy0 * gW + gx1];
        const w01 = gridWhite[gy1 * gW + gx0];
        const w11 = gridWhite[gy1 * gW + gx1];
        const localWhite = w00 * (1 - fx) * (1 - fy) + w10 * fx * (1 - fy) + w01 * (1 - fx) * fy + w11 * fx * fy;
        
        const safeWhite = Math.max(80, localWhite);
        const scale = 245 / safeWhite;
        
        const i = (py * w + px) * 4;
        d[i] = Math.min(255, Math.round(d[i] * scale));
        d[i + 1] = Math.min(255, Math.round(d[i + 1] * scale));
        d[i + 2] = Math.min(255, Math.round(d[i + 2] * scale));
      }
    }
    
    outCtx.putImageData(imgData, 0, 0);
    console.log(`[Enhance] Applied adaptive brightness: ${w}x${h}, grid=${gridSize}px`);
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
      
      // Apply adaptive brightness enhancement (handles shadows / uneven lighting)
      // No perspective warp — the 4-corner marker system handles skew implicitly
      console.log('[Enhance] Starting image enhancement...');
      const enhancedCanvas = enhanceImage(canvas);
      
      // Update the displayed image with the enhanced version
      setCapturedImage(enhancedCanvas.toDataURL('image/png'));
      
      // Get image data from the enhanced canvas
      const enhCtx = enhancedCanvas.getContext('2d');
      if (!enhCtx) throw new Error('Enhanced canvas context not available');
      const imageData = enhCtx.getImageData(0, 0, enhancedCanvas.width, enhancedCanvas.height);
      
      console.log(`[OMR] Processing enhanced image: ${imageData.width}x${imageData.height}`);
      
      // Process the image to detect filled bubbles
      const { studentId, answers, multipleAnswers, idDoubleShades, debugMarkers } = await detectBubbles(imageData, exam.num_items, exam.choices_per_item);
      
      // Draw debug overlay showing detected marker positions and ID bubble sample points
      if (debugMarkers) {
        const debugCanvas = document.createElement('canvas');
        debugCanvas.width = enhancedCanvas.width;
        debugCanvas.height = enhancedCanvas.height;
        const dCtx = debugCanvas.getContext('2d');
        if (dCtx) {
          dCtx.drawImage(enhancedCanvas, 0, 0);
          
          // Draw marker positions as large red circles with crosshairs
          const markerPoints = [
            { label: 'TL', ...debugMarkers.topLeft },
            { label: 'TR', ...debugMarkers.topRight },
            { label: 'BL', ...debugMarkers.bottomLeft },
            { label: 'BR', ...debugMarkers.bottomRight },
          ];
          for (const mp of markerPoints) {
            // Filled red dot
            dCtx.fillStyle = 'rgba(255, 0, 0, 0.6)';
            dCtx.beginPath();
            dCtx.arc(mp.x, mp.y, 12, 0, Math.PI * 2);
            dCtx.fill();
            // White crosshair for visibility
            dCtx.strokeStyle = '#FFFFFF';
            dCtx.lineWidth = 2;
            dCtx.beginPath();
            dCtx.moveTo(mp.x - 25, mp.y);
            dCtx.lineTo(mp.x + 25, mp.y);
            dCtx.moveTo(mp.x, mp.y - 25);
            dCtx.lineTo(mp.x, mp.y + 25);
            dCtx.stroke();
            // Red outline circle
            dCtx.strokeStyle = '#FF0000';
            dCtx.lineWidth = 3;
            dCtx.beginPath();
            dCtx.arc(mp.x, mp.y, 20, 0, Math.PI * 2);
            dCtx.stroke();
            // Label with background
            dCtx.fillStyle = '#FF0000';
            dCtx.font = 'bold 20px sans-serif';
            dCtx.fillText(mp.label, mp.x + 24, mp.y - 12);
          }
          
          // Draw connecting lines between markers (bright green, thick)
          dCtx.strokeStyle = '#00FF00';
          dCtx.lineWidth = 2;
          dCtx.setLineDash([10, 5]);
          dCtx.beginPath();
          dCtx.moveTo(debugMarkers.topLeft.x, debugMarkers.topLeft.y);
          dCtx.lineTo(debugMarkers.topRight.x, debugMarkers.topRight.y);
          dCtx.lineTo(debugMarkers.bottomRight.x, debugMarkers.bottomRight.y);
          dCtx.lineTo(debugMarkers.bottomLeft.x, debugMarkers.bottomLeft.y);
          dCtx.closePath();
          dCtx.stroke();
          dCtx.setLineDash([]);

          // Draw ID bubble sample positions as small blue dots
          // This lets us verify the grid is properly aligned with the ID bubbles
          const layout = getTemplateLayout(exam.num_items);
          for (let col = 0; col < 10; col++) {
            for (let row = 0; row < 10; row++) {
              const nx = layout.id.firstColNX + col * layout.id.colSpacingNX;
              const ny = layout.id.firstRowNY + row * layout.id.rowSpacingNY;
              // Bilinear interpolation (same as mapToPixel)
              const topX = debugMarkers.topLeft.x + nx * (debugMarkers.topRight.x - debugMarkers.topLeft.x);
              const topY = debugMarkers.topLeft.y + nx * (debugMarkers.topRight.y - debugMarkers.topLeft.y);
              const botX = debugMarkers.bottomLeft.x + nx * (debugMarkers.bottomRight.x - debugMarkers.bottomLeft.x);
              const botY = debugMarkers.bottomLeft.y + nx * (debugMarkers.bottomRight.y - debugMarkers.bottomLeft.y);
              const px = topX + ny * (botX - topX);
              const py = topY + ny * (botY - topY);
              
              dCtx.fillStyle = 'rgba(0, 100, 255, 0.7)';
              dCtx.beginPath();
              dCtx.arc(px, py, 3, 0, Math.PI * 2);
              dCtx.fill();
            }
          }
          
          setCapturedImage(debugCanvas.toDataURL('image/png'));
        }
      }
      
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
  // Finds the 4 black alignment squares printed at the corners of every answer sheet.
  //
  // CHALLENGE for 100-item template: there are ~12 small indicator squares (■ 2.5mm)
  // at each question block header. The real markers are 7mm (100-item) or 4mm (20/50-item).
  //
  // STRATEGY:
  //   1. Estimate expected marker size in pixels based on image dimensions and template
  //   2. Only search at sizes near the expected marker size (reject too-small candidates)
  //   3. Use INTEGRAL IMAGE for fast dark-region scanning
  //   4. For each corner: find the darkest region of the expected size → that's the marker
  //   5. Refine with sub-pixel accuracy
  const findCornerMarkers = (
    _binary: Uint8Array,
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
    if (!grayscale) {
      return {
        found: false,
        topLeft: { x: width * 0.05, y: height * 0.05 },
        topRight: { x: width * 0.95, y: height * 0.05 },
        bottomLeft: { x: width * 0.05, y: height * 0.95 },
        bottomRight: { x: width * 0.95, y: height * 0.95 },
      };
    }

    // Build integral image for fast region-sum queries
    const integral = new Float64Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        rowSum += grayscale[y * width + x];
        integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
      }
    }

    // Fast average brightness of a rectangle using integral image
    const rectAvg = (x1: number, y1: number, x2: number, y2: number): number => {
      // Clamp to image bounds
      x1 = Math.max(0, x1); y1 = Math.max(0, y1);
      x2 = Math.min(width, x2); y2 = Math.min(height, y2);
      const area = (x2 - x1) * (y2 - y1);
      if (area <= 0) return 255;
      const sum = integral[y2 * (width + 1) + x2] - integral[y1 * (width + 1) + x2]
                 - integral[y2 * (width + 1) + x1] + integral[y1 * (width + 1) + x1];
      return sum / area;
    };

    // Estimate marker size in pixels.
    // The paper fills most of the captured image (it's cropped to the guide frame).
    // For 100-item: marker = 7mm on 210mm wide paper → ~3.3% of paper width
    // For 20/50-item: marker = 4mm on 105mm wide paper → ~3.8% of paper width
    // So roughly 3-4% of image width is the marker size.
    // Try a range of sizes around that estimate.
    const estSize = Math.round(width * 0.033);
    const sizes = [
      Math.max(8, Math.round(estSize * 0.6)),
      Math.max(10, Math.round(estSize * 0.8)),
      Math.max(12, estSize),
      Math.round(estSize * 1.3),
      Math.round(estSize * 1.6),
      Math.round(estSize * 2.0),
    ];

    console.log(`[OMR] Marker search: image=${width}x${height}, estSize=${estSize}px, sizes=[${sizes.join(',')}]`);

    // Search region: only the outer 20% of each edge — markers are at the very corner
    const searchW = Math.floor(width * 0.20);
    const searchH = Math.floor(height * 0.20);

    // Find the best marker in a corner region.
    // We look for the darkest square-shaped region of the expected size.
    // Score = (border brightness - interior brightness) × uniformity × size bonus
    const findCornerMarker = (
      rx1: number, ry1: number, rx2: number, ry2: number,
      label: string
    ) => {
      let bestX = (rx1 + rx2) / 2, bestY = (ry1 + ry2) / 2, bestScore = 0, bestSize = estSize;

      for (const size of sizes) {
        const half = Math.floor(size / 2);
        const step = Math.max(2, Math.floor(size / 3));

        for (let cy = ry1 + half; cy <= ry2 - half; cy += step) {
          for (let cx = rx1 + half; cx <= rx2 - half; cx += step) {
            // Interior brightness (the marker itself)
            const innerAvg = rectAvg(cx - half, cy - half, cx + half, cy + half);

            // Must be actually dark
            if (innerAvg > 100) continue;

            // Border ring brightness (1 marker-width around it)
            // Sample a wider ring to check paper background
            const outerAvg = rectAvg(
              cx - half * 2, cy - half * 2,
              cx + half * 2, cy + half * 2
            );
            // The outer rect includes the inner rect, so extract just the border
            const outerArea = (4 * half) * (4 * half);
            const innerArea = (2 * half) * (2 * half);
            const borderOnlyAvg = (outerAvg * outerArea - innerAvg * innerArea) / Math.max(1, outerArea - innerArea);

            const contrast = borderOnlyAvg - innerAvg;
            if (contrast < 40) continue;

            // Uniformity: check that the interior is consistently dark
            // Sample 4 quadrants
            const q1 = rectAvg(cx - half, cy - half, cx, cy);
            const q2 = rectAvg(cx, cy - half, cx + half, cy);
            const q3 = rectAvg(cx - half, cy, cx, cy + half);
            const q4 = rectAvg(cx, cy, cx + half, cy + half);
            const qMax = Math.max(q1, q2, q3, q4);
            const qMin = Math.min(q1, q2, q3, q4);
            if (qMax - qMin > 60) continue; // not uniform → probably not a solid square

            // Score: contrast × (1 + size bonus)
            // Larger markers score higher — real markers are bigger than indicator squares
            const sizeBonus = size / estSize;
            const score = contrast * sizeBonus;

            if (score > bestScore) {
              bestScore = score;
              bestX = cx;
              bestY = cy;
              bestSize = size;
            }
          }
        }
      }

      // Pixel-level refinement around best position
      if (bestScore > 0) {
        const refineR = Math.max(4, Math.floor(bestSize / 3));
        const half = Math.floor(bestSize / 2);
        let refinedX = bestX, refinedY = bestY, refinedScore = bestScore;

        for (let cy = bestY - refineR; cy <= bestY + refineR; cy++) {
          for (let cx = bestX - refineR; cx <= bestX + refineR; cx++) {
            if (cx - half < 0 || cx + half >= width || cy - half < 0 || cy + half >= height) continue;
            const innerAvg = rectAvg(cx - half, cy - half, cx + half, cy + half);
            if (innerAvg > 100) continue;
            const outerAvg = rectAvg(cx - half * 2, cy - half * 2, cx + half * 2, cy + half * 2);
            const outerArea = (4 * half) * (4 * half);
            const innerArea = (2 * half) * (2 * half);
            const borderOnlyAvg = (outerAvg * outerArea - innerAvg * innerArea) / Math.max(1, outerArea - innerArea);
            const score = (borderOnlyAvg - innerAvg) * (bestSize / estSize);
            if (score > refinedScore) {
              refinedScore = score;
              refinedX = cx;
              refinedY = cy;
            }
          }
        }
        bestX = refinedX;
        bestY = refinedY;
        bestScore = refinedScore;
      }

      console.log(`[OMR] ${label}: pos=(${Math.round(bestX)},${Math.round(bestY)}) score=${bestScore.toFixed(0)} size=${bestSize}px`);
      return { x: bestX, y: bestY, score: bestScore };
    };

    // Find marker in each corner — search only the outer edge region
    const tl = findCornerMarker(0, 0, searchW, searchH, 'TL');
    const tr = findCornerMarker(width - searchW, 0, width, searchH, 'TR');
    const bl = findCornerMarker(0, height - searchH, searchW, height, 'BL');
    const br = findCornerMarker(width - searchW, height - searchH, width, height, 'BR');

    console.log(`[OMR] Marker scores: TL=${tl.score.toFixed(0)} TR=${tr.score.toFixed(0)} BL=${bl.score.toFixed(0)} BR=${br.score.toFixed(0)}`);
    console.log(`[OMR] Marker positions: TL=(${Math.round(tl.x)},${Math.round(tl.y)}) TR=(${Math.round(tr.x)},${Math.round(tr.y)}) BL=(${Math.round(bl.x)},${Math.round(bl.y)}) BR=(${Math.round(br.x)},${Math.round(br.y)})`);

    // All 4 markers must have a minimum quality score
    const minScore = 20;
    const allFound = tl.score >= minScore && tr.score >= minScore && bl.score >= minScore && br.score >= minScore;

    if (allFound) {
      // Geometry validation: markers should form a reasonable quadrilateral
      const topWidth = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
      const bottomWidth = Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2));
      const leftHeight = Math.sqrt(Math.pow(bl.x - tl.x, 2) + Math.pow(bl.y - tl.y, 2));
      const rightHeight = Math.sqrt(Math.pow(br.x - tr.x, 2) + Math.pow(br.y - tr.y, 2));

      const widthRatio = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth);
      const heightRatio = Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight);
      const aspect = (topWidth + bottomWidth) / (leftHeight + rightHeight);

      const geometryOk = widthRatio > 0.80 && heightRatio > 0.80 && aspect > 0.4 && aspect < 2.5;

      console.log(`[OMR] Geometry: topW=${topWidth.toFixed(0)} botW=${bottomWidth.toFixed(0)} leftH=${leftHeight.toFixed(0)} rightH=${rightHeight.toFixed(0)} aspect=${aspect.toFixed(2)} wR=${widthRatio.toFixed(2)} hR=${heightRatio.toFixed(2)} ok=${geometryOk}`);

      return {
        found: geometryOk,
        topLeft: { x: tl.x, y: tl.y },
        topRight: { x: tr.x, y: tr.y },
        bottomLeft: { x: bl.x, y: bl.y },
        bottomRight: { x: br.x, y: br.y },
      };
    }

    console.log('[OMR] Marker score check failed, using fallback');
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
    // EXACT COORDINATE DERIVATION from drawFullSheet():
    //   margin=10, inset=3, markerSize=7, lx=10, rx=200, usableW=190
    //   bubbleGap=5.0, rowH=4.8, numW=12 (space for question numbers)
    //   qBlockW = 12 + (5-1)*5.0 + 3.8 = 35.8mm
    //   colGap = (190 - 4*35.8) / 5 = 9.36mm
    //
    // Top section (Q41-50, Q71-80):
    //   idBorderW = (8 + 10*4.5) + 2*3 = 59mm, afterIdX = 10+59 = 69mm
    //   remainW = 200-69 = 131mm, topGap = (131 - 2*35.8)/2 = 29.7mm
    //   b41x = 69 + 29.7/2 = 83.85mm → first bubble at 83.85+12 = 95.85mm page
    //   b71x = 83.85 + 35.8 + 29.7 = 149.35mm → first bubble at 161.35mm page
    //
    // Bottom grid (4 cols × 2 rows):
    //   col0: bx = 10 + 9.36 = 19.36mm → first bubble at 31.36mm page
    //   col1: bx = 10 + 9.36 + 45.16 = 64.52mm → first bubble at 76.52mm page
    //   col2: bx = 10 + 9.36 + 90.32 = 109.68mm → first bubble at 121.68mm page
    //   col3: bx = 10 + 9.36 + 135.48 = 154.84mm → first bubble at 166.84mm page
    //
    // NX = (pageX - 6.5) / fw, NY = (pageY - 6.5) / fh
    const fw = 197, fh = 215.5;
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
        // drawQBlock header at Y=53, +4.5 → first bubble Y = 57.5 → NY = 51/fh
        {
          startQ: 41, endQ: 50,
          // b41x=83.85, first bubble = 83.85+12 = 95.85 → NX = (95.85-6.5)/fw = 89.35/fw
          firstBubbleNX: 89.35 / fw,
          firstBubbleNY: 51 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 71, endQ: 80,
          // b71x=149.35, first bubble = 149.35+12 = 161.35 → NX = (161.35-6.5)/fw = 154.85/fw
          firstBubbleNX: 154.85 / fw,
          firstBubbleNY: 51 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        // Bottom grid – row 0: by=107, header+4.5 → first bubble at Y=111.5 → NY = 105/fh
        {
          startQ: 1, endQ: 10,
          // col0: bx=19.36, first bubble = 31.36 → NX = 24.86/fw
          firstBubbleNX: 24.86 / fw,
          firstBubbleNY: 105 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 21, endQ: 30,
          // col1: bx=64.52, first bubble = 76.52 → NX = 70.02/fw
          firstBubbleNX: 70.02 / fw,
          firstBubbleNY: 105 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 51, endQ: 60,
          // col2: bx=109.68, first bubble = 121.68 → NX = 115.18/fw
          firstBubbleNX: 115.18 / fw,
          firstBubbleNY: 105 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 81, endQ: 90,
          // col3: bx=154.84, first bubble = 166.84 → NX = 160.34/fw
          firstBubbleNX: 160.34 / fw,
          firstBubbleNY: 105 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        // Bottom grid – row 1: by=163, header+4.5 → first bubble at Y=167.5 → NY = 161/fh
        {
          startQ: 11, endQ: 20,
          firstBubbleNX: 24.86 / fw,
          firstBubbleNY: 161 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 31, endQ: 40,
          firstBubbleNX: 70.02 / fw,
          firstBubbleNY: 161 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 61, endQ: 70,
          firstBubbleNX: 115.18 / fw,
          firstBubbleNY: 161 / fh,
          bubbleSpacingNX: 5.0 / fw,
          rowSpacingNY: 4.8 / fh,
        },
        {
          startQ: 91, endQ: 100,
          firstBubbleNX: 160.34 / fw,
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
  ): Promise<{
    studentId: string;
    answers: string[];
    multipleAnswers: number[];
    idDoubleShades: number[];
    debugMarkers?: {
      topLeft: { x: number; y: number };
      topRight: { x: number; y: number };
      bottomLeft: { x: number; y: number };
      bottomRight: { x: number; y: number };
    };
  }> => {
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
    const sortSample: number[] = [];
    const sampleStep = Math.max(1, Math.floor(rawGrayscale.length / 10000));
    for (let i = 0; i < rawGrayscale.length; i += sampleStep) {
      sortSample.push(rawGrayscale[i]);
    }
    sortSample.sort((a, b) => a - b);
    const gMin = sortSample[Math.floor(sortSample.length * 0.02)];
    const gMax = sortSample[Math.floor(sortSample.length * 0.98)];
    const gRange = Math.max(1, gMax - gMin);

    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < rawGrayscale.length; i++) {
      grayscale[i] = Math.max(0, Math.min(255, Math.round(((rawGrayscale[i] - gMin) / gRange) * 255)));
    }
    console.log(`[OMR] Contrast normalization: min=${gMin} max=${gMax} range=${gRange}`);

    // 2. Find corner alignment markers using grayscale (no binary needed)
    const dummyBinary = new Uint8Array(0); // not used by new marker detector
    const markers = findCornerMarkers(dummyBinary, width, height, grayscale);
    console.log('[OMR] Corner markers found:', markers.found,
      'TL:', Math.round(markers.topLeft.x), Math.round(markers.topLeft.y),
      'BR:', Math.round(markers.bottomRight.x), Math.round(markers.bottomRight.y));

    // 3. Fallback: use image bounds with margin if markers not found
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

    // 4. Get template layout for this exam's question count
    const layout = getTemplateLayout(numQuestions);

    // 5. Detect student ID and answers using GRAYSCALE for bubble sampling
    const { studentId, doubleShadeColumns } = detectStudentIdFromImage(grayscale, width, height, effectiveMarkers, layout);
    const { answers, multipleAnswers } = detectAnswersFromImage(
      grayscale, width, height, effectiveMarkers, layout, numQuestions, choicesPerQuestion
    );

    return { studentId, answers, multipleAnswers, idDoubleShades: doubleShadeColumns, debugMarkers: effectiveMarkers };
  };

  // ─── BUBBLE SAMPLING (grayscale-based) ───
  // Returns the MEAN BRIGHTNESS of the bubble interior (0-255).
  // LOWER value = DARKER = MORE LIKELY FILLED.
  // 
  // We sample only the interior of the bubble and return raw brightness.
  // Detection functions compare bubbles WITHIN the same column/question —
  // the filled bubble will simply be much darker than unfilled ones.
  const sampleBubbleAt = (
    grayscale: Uint8Array,
    imgW: number,
    imgH: number,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number
  ): number => {
    // Sample the center of the bubble using an elliptical mask
    // Use inner 50% to safely avoid the printed circle outline
    let sum = 0, count = 0;
    const innerRX = radiusX * 0.50;
    const innerRY = radiusY * 0.50;
    const step = Math.max(1, Math.floor(Math.min(innerRX, innerRY) / 4));

    for (let dy = -Math.ceil(innerRY); dy <= Math.ceil(innerRY); dy += step) {
      for (let dx = -Math.ceil(innerRX); dx <= Math.ceil(innerRX); dx += step) {
        if (innerRX > 0 && innerRY > 0 && (dx * dx) / (innerRX * innerRX) + (dy * dy) / (innerRY * innerRY) > 1) continue;
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
          sum += grayscale[py * imgW + px];
          count++;
        }
      }
    }

    // Also sample the exact center cross pattern for extra precision
    // This catches small-pencil fills that are concentrated at center
    for (let r = 0; r <= Math.floor(innerRX * 0.7); r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
          sum += grayscale[py * imgW + px];
          count++;
        }
      }
    }

    if (count === 0) return 255; // default = bright = unfilled
    return sum / count; // raw brightness: low = dark = filled
  };

  // ─── DETECT STUDENT ID ───
  // sampleBubbleAt returns RAW BRIGHTNESS (0-255): lower = darker = filled.
  // For each ID column (10 digits 0-9), we find the DARKEST bubble.
  // Detection uses a robust approach:
  //   1. The darkest must be significantly darker than the MEDIAN of all 10 bubbles
  //   2. We use the gap between darkest and 2nd-darkest as additional confidence
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

    // ID bubbles are slightly smaller than answer bubbles
    const idBubbleRX = bubbleRX * (3.5 / 3.8);
    const idBubbleRY = bubbleRY * (3.5 / 3.8);

    console.log('[ID] BubbleR:', idBubbleRX.toFixed(1), 'x', idBubbleRY.toFixed(1));

    // Log the pixel position of the first and last ID bubbles for visual verification
    const firstIdPx = mapToPixel(markers, id.firstColNX, id.firstRowNY);
    const lastIdPx = mapToPixel(markers, id.firstColNX + 9 * id.colSpacingNX, id.firstRowNY + 9 * id.rowSpacingNY);
    console.log(`[ID] First bubble px=(${Math.round(firstIdPx.px)},${Math.round(firstIdPx.py)}), Last bubble px=(${Math.round(lastIdPx.px)},${Math.round(lastIdPx.py)})`);
    console.log(`[ID] Frame: TL=(${Math.round(markers.topLeft.x)},${Math.round(markers.topLeft.y)}) BR=(${Math.round(markers.bottomRight.x)},${Math.round(markers.bottomRight.y)}) size=${Math.round(frameW)}x${Math.round(frameH)}`);

    for (let col = 0; col < 10; col++) {
      const fills: number[] = []; // raw brightness values (lower = darker)

      for (let row = 0; row < 10; row++) {
        const nx = id.firstColNX + col * id.colSpacingNX;
        const ny = id.firstRowNY + row * id.rowSpacingNY;
        const { px, py } = mapToPixel(markers, nx, ny);
        const brightness = sampleBubbleAt(grayscale, width, height, px, py, idBubbleRX, idBubbleRY);
        fills.push(brightness);
      }

      // Sort ascending — lowest brightness = darkest = most filled
      const sorted = [...fills].sort((a, b) => a - b);
      const darkest = sorted[0];     // most filled
      const secondDark = sorted[1];  // second most filled
      // Use the upper quartile (index 7) as the "unfilled" reference
      // This is more robust than median — unfilled bubbles should be bright
      const upperQ = sorted[7];

      let detectedDigit = 0;
      let hasDetection = false;

      // Detection criteria:
      // 1. The darkest bubble must be < 65% of the upper quartile brightness (35%+ drop)
      // 2. OR: the gap between darkest and 2nd-darkest must be > 15% of upper quartile
      //    AND darkest < 80% of upper quartile
      const darkRatio = upperQ > 20 ? darkest / upperQ : 1;
      const gapFromSecond = secondDark - darkest;
      const gapRatio = upperQ > 20 ? gapFromSecond / upperQ : 0;

      if (darkRatio < 0.65) {
        // Strong detection: darkest is much darker than unfilled
        detectedDigit = fills.indexOf(darkest);
        hasDetection = true;
      } else if (darkRatio < 0.80 && gapRatio > 0.12) {
        // Moderate detection: darkest is somewhat dark AND clearly separated from 2nd
        detectedDigit = fills.indexOf(darkest);
        hasDetection = true;
      }

      if (hasDetection) {
        // Check for double-shade: is the 2nd-darkest ALSO significantly dark?
        const secondRatio = upperQ > 20 ? secondDark / upperQ : 1;
        const gapBetweenTopTwo = upperQ > 20 ? gapFromSecond / upperQ : 1;
        // Double shade if 2nd is also quite dark AND close to the darkest
        if (secondRatio < 0.70 && gapBetweenTopTwo < 0.08) {
          doubleShadeColumns.push(col + 1);
          console.log(`[ID] ⚠️ Col ${col} DOUBLE SHADE: darkest=${darkest.toFixed(0)} 2nd=${secondDark.toFixed(0)} upperQ=${upperQ.toFixed(0)}`);
        }
      }

      console.log(`[ID] Col ${col}: brightness=[${fills.map(f => f.toFixed(0)).join(',')}] → ${hasDetection ? detectedDigit : '?'} (darkest=${darkest.toFixed(0)} upperQ=${upperQ.toFixed(0)} ratio=${darkRatio.toFixed(2)} gap=${gapRatio.toFixed(2)})`);
      idDigits.push(hasDetection ? detectedDigit : 0);
    }

    const raw = idDigits.join('');
    console.log('[ID] Raw digits:', raw, doubleShadeColumns.length > 0 ? `(double-shade: cols ${doubleShadeColumns.join(',')})` : '');
    return { studentId: raw, doubleShadeColumns };
  };

  // ─── DETECT ANSWERS ───
  // sampleBubbleAt returns RAW BRIGHTNESS (0-255): lower = darker = filled.
  // For each question, the darkest choice wins if it's sufficiently darker than the rest.
  // Uses the BRIGHTEST bubble in the row as the "unfilled" reference — this is more
  // robust than using a median when there are only 4-5 choices.
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

    console.log(`[ANS] Frame: ${Math.round(frameW)}x${Math.round(frameH)}px, BubbleR: ${bubbleRX.toFixed(1)}x${bubbleRY.toFixed(1)}px`);

    for (const block of layout.answerBlocks) {
      const firstPx = mapToPixel(markers, block.firstBubbleNX, block.firstBubbleNY);
      console.log(`[ANS] Block Q${block.startQ}-${block.endQ}: firstBubble px=(${Math.round(firstPx.px)},${Math.round(firstPx.py)})`);

      for (let q = block.startQ; q <= block.endQ && q <= numQuestions; q++) {
        const qIndex = q - 1;
        const rowInBlock = q - block.startQ;

        const fills: { choice: string; brightness: number }[] = [];

        for (let c = 0; c < choicesPerQuestion; c++) {
          const nx = block.firstBubbleNX + c * block.bubbleSpacingNX;
          const ny = block.firstBubbleNY + rowInBlock * block.rowSpacingNY;
          const { px, py } = mapToPixel(markers, nx, ny);
          const brightness = sampleBubbleAt(grayscale, width, height, px, py, bubbleRX, bubbleRY);
          fills.push({ choice: choiceLabels[c], brightness });
        }

        // Sort ASCENDING by brightness — darkest (most filled) first
        const sorted = [...fills].sort((a, b) => a.brightness - b.brightness);
        const darkest = sorted[0].brightness;
        const secondDark = sorted.length >= 2 ? sorted[1].brightness : 255;
        const brightest = sorted[sorted.length - 1].brightness;

        let selectedChoice = '';

        // Use the brightest bubble as the "unfilled" reference
        // For a 5-choice question, at most 1 is filled, so the brightest is a good reference
        const ref = brightest;
        const darkRatio = ref > 20 ? darkest / ref : 1;
        const gapFromSecond = secondDark - darkest;
        const gapRatio = ref > 20 ? gapFromSecond / ref : 0;

        // Detection: darkest must be < 70% of brightest (30%+ drop)
        // OR: darkest < 85% of brightest AND clear gap from 2nd
        if (darkRatio < 0.70) {
          selectedChoice = sorted[0].choice;
        } else if (darkRatio < 0.85 && gapRatio > 0.10) {
          selectedChoice = sorted[0].choice;
        }

        // Check for multiple answers
        if (selectedChoice) {
          const secondRatio = ref > 20 ? secondDark / ref : 1;
          const gapBetweenTopTwo = ref > 20 ? gapFromSecond / ref : 1;
          // Multiple answers: 2nd darkest is also quite dark AND close to darkest
          if (secondRatio < 0.72 && gapBetweenTopTwo < 0.06) {
            multipleAnswers.push(q);
            console.log(`[MULTI] Q${q}: ${sorted.slice(0, 3).map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')} ref=${ref.toFixed(0)}`);
          }
        }

        // Log first few questions per block + last for debugging
        if (q <= block.startQ + 2 || q === block.endQ) {
          console.log(`[ANS] Q${q}: ${fills.map(f => `${f.choice}=${f.brightness.toFixed(0)}`).join(', ')} → ${selectedChoice || '?'} (darkRatio=${darkRatio.toFixed(2)} gapRatio=${gapRatio.toFixed(2)} ref=${ref.toFixed(0)})`);
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
              <p className="text-xs text-gray-400">Brightness enhancement • Corner marker detection • OMR bubble reading</p>
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