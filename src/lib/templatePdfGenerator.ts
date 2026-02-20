import jsPDF from 'jspdf';

interface TemplateData {
  name: string;
  description: string;
  numQuestions: number;
  choicesPerQuestion: number;
  examName?: string;
  className?: string;
}

export function generateTemplatePDF(template: TemplateData) {
  // A4 dimensions in mm: 210 x 297
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;

  // Add alignment markers (corners) - solid black circles
  const markerRadius = 4;
  const markerOffset = 8;
  
  // Top-left marker
  doc.circle(markerOffset, markerOffset, markerRadius, 'F');
  // Top-right marker
  doc.circle(pageWidth - markerOffset, markerOffset, markerRadius, 'F');
  // Bottom-left marker
  doc.circle(markerOffset, pageHeight - markerOffset, markerRadius, 'F');
  // Bottom-right marker
  doc.circle(pageWidth - markerOffset, pageHeight - markerOffset, markerRadius, 'F');

  let currentY = margin + 10;

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(template.name, pageWidth / 2, currentY, { align: 'center' });

  currentY += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(template.description, pageWidth / 2, currentY, { align: 'center' });

  currentY += 10;

  // Student Information Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('STUDENT INFORMATION', margin, currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  // Name field
  doc.text('Name:', margin, currentY);
  doc.line(margin + 15, currentY, pageWidth - margin, currentY);
  currentY += 6;

  // Student ID field
  doc.text('Student ID:', margin, currentY);
  doc.line(margin + 23, currentY, pageWidth - margin, currentY);
  currentY += 6;

  // Class/Section
  doc.text('Class/Section:', margin, currentY);
  doc.line(margin + 27, currentY, pageWidth - margin, currentY);
  currentY += 10;

  // Student ID Bubbles Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('STUDENT ID (Fill in bubbles):', margin, currentY);
  currentY += 5;

  // Draw 10 columns for student ID digits
  const idStartX = margin + 5;
  const idBubbleRadius = 1.5;
  const idColSpacing = 4.2;
  const idRowSpacing = 3.5;
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  
  for (let col = 0; col < 10; col++) {
    const x = idStartX + col * (idColSpacing * 2.5);
    
    // Column number header
    doc.setFont('helvetica', 'bold');
    doc.text((col + 1).toString(), x, currentY - 0.5);
    doc.setFont('helvetica', 'normal');
    
    // Draw 10 rows (0-9) for each digit position
    for (let row = 0; row < 10; row++) {
      const y = currentY + 2 + row * idRowSpacing;
      
      // Draw digit label for first column
      if (col === 0) {
        doc.text(row.toString(), margin + 1, y + 1);
      }
      
      // Draw bubble
      doc.circle(x, y, idBubbleRadius);
    }
  }

  currentY += 10 * idRowSpacing + 10;

  // Answer Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ANSWERS', margin, currentY);
  currentY += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Fill in the bubble completely. Erase cleanly if you wish to change an answer.', margin, currentY);
  currentY += 7;

  // Answer choices
  const choices = ['A', 'B', 'C', 'D', 'E'];
  const answerChoices = choices.slice(0, template.choicesPerQuestion);
  
  // Calculate layout
  const questionsPerColumn = 25;
  const numColumns = Math.ceil(template.numQuestions / questionsPerColumn);
  const columnWidth = (pageWidth - 2 * margin) / numColumns;
  const answerRowHeight = 5.5;
  const answerBubbleRadius = 1.5;
  const answerBubbleSpacing = 4.5;

  for (let col = 0; col < numColumns; col++) {
    const startQuestion = col * questionsPerColumn + 1;
    const endQuestion = Math.min((col + 1) * questionsPerColumn, template.numQuestions);
    const columnX = margin + col * columnWidth;

    let questionY = currentY;

    for (let q = startQuestion; q <= endQuestion; q++) {
      // Question number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      const questionNumWidth = q < 10 ? 3 : q < 100 ? 5 : 7;
      doc.text(q.toString() + '.', columnX, questionY + 1.5);

      // Answer bubbles
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      
      for (let i = 0; i < answerChoices.length; i++) {
        const bubbleX = columnX + questionNumWidth + 3 + i * answerBubbleSpacing;
        
        // Choice letter above bubble
        doc.text(answerChoices[i], bubbleX - 0.8, questionY - 0.5);
        
        // Bubble circle
        doc.circle(bubbleX, questionY + 1, answerBubbleRadius);
      }

      questionY += answerRowHeight;
      
      // Check if we need a new page
      if (questionY > pageHeight - 20 && q < endQuestion) {
        doc.addPage();
        
        // Re-add alignment markers on new page
        doc.circle(markerOffset, markerOffset, markerRadius, 'F');
        doc.circle(pageWidth - markerOffset, markerOffset, markerRadius, 'F');
        doc.circle(markerOffset, pageHeight - markerOffset, markerRadius, 'F');
        doc.circle(pageWidth - markerOffset, pageHeight - markerOffset, markerRadius, 'F');
        
        questionY = margin + 15;
      }
    }
  }

  // Footer
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text('Do not fold, staple, or tear this answer sheet.', pageWidth / 2, pageHeight - 8, { align: 'center' });

  // Generate filename
  const filename = `${template.name.replace(/[^a-z0-9]/gi, '_')}_Answer_Sheet.pdf`;
  
  // Download the PDF
  doc.save(filename);
}
