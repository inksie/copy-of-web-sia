import jsPDF from 'jspdf';

interface TemplateData {
  name: string;
  description: string;
  numQuestions: number;
  choicesPerQuestion: number;
  examName?: string;
  className?: string;
}

// Load GC logo
async function loadGCLogo(): Promise<string> {
  try {
    const response = await fetch('/gc logo.png');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to load GC logo:', error);
    return '';
  }
}

// Helper function to draw a circle (for answer bubbles)
function drawBubble(doc: jsPDF, x: number, y: number, size: number) {
  // Draw white circle for shading (no square border)
  // Make circle bigger - use full size instead of 35%
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(255, 255, 255);
  doc.circle(x, y, size * 0.5, 'FD'); // Circle is now 100% of size (diameter = size)
}

export async function generateTemplatePDF(template: TemplateData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Load logo
  const logoData = await loadGCLogo();

  // Choose layout based on number of questions
  if (template.numQuestions === 20) {
    generateTemplate20(doc, template, logoData);
  } else if (template.numQuestions === 50) {
    generateTemplate50(doc, template, logoData);
  } else if (template.numQuestions === 100) {
    generateTemplate100(doc, template, logoData);
  }

  // Generate filename
  const filename = `${template.name.replace(/[^a-z0-9]/gi, '_')}_Answer_Sheet.pdf`;
  
  // Download the PDF
  doc.save(filename);
}

// 20 Questions - 4 mini sheets per page (2x2 grid)
function generateTemplate20(doc: jsPDF, template: TemplateData, logoData: string) {
  const pageWidth = 210;
  const pageHeight = 297;
  
  // Create 4 mini sheets in a 2x2 grid
  const sheetWidth = pageWidth / 2;
  const sheetHeight = pageHeight / 2;
  
  const positions = [
    { x: 0, y: 0 }, // Top left
    { x: sheetWidth, y: 0 }, // Top right
    { x: 0, y: sheetHeight }, // Bottom left
    { x: sheetWidth, y: sheetHeight }, // Bottom right
  ];
  
  positions.forEach((pos) => {
    drawMiniSheet(doc, pos.x, pos.y, sheetWidth, sheetHeight, template, 20, logoData);
  });
}

// 50 Questions - 2 sheets per page (side by side)
function generateTemplate50(doc: jsPDF, template: TemplateData, logoData: string) {
  const pageWidth = 210;
  const pageHeight = 297;
  
  const sheetWidth = pageWidth / 2;
  const sheetHeight = pageHeight;
  
  // Left sheet
  drawMiniSheet(doc, 0, 0, sheetWidth, sheetHeight, template, 50, logoData);
  
  // Right sheet
  drawMiniSheet(doc, sheetWidth, 0, sheetWidth, sheetHeight, template, 50, logoData);
}

// 100 Questions - Full page single sheet
function generateTemplate100(doc: jsPDF, template: TemplateData, logoData: string) {
  const pageWidth = 210;
  const pageHeight = 297;
  
  drawFullSheet(doc, 0, 0, pageWidth, pageHeight, template, logoData);
}

// Draw a mini sheet (for 20 and 50 questions)
function drawMiniSheet(
  doc: jsPDF,
  startX: number,
  startY: number,
  width: number,
  height: number,
  template: TemplateData,
  questionsPerSheet: number,
  logoData: string
) {
  const margin = 3; // Reduced margin for less white space
  const bubbleSize = 3.2; // Larger bubbles
  const markerSize = 4;
  
  // Alignment markers - BLACK SQUARES
  doc.setFillColor(0, 0, 0);
  doc.rect(startX + margin - markerSize/2, startY + margin - markerSize/2, markerSize, markerSize, 'F');
  doc.rect(startX + width - margin - markerSize/2, startY + margin - markerSize/2, markerSize, markerSize, 'F');
  doc.rect(startX + margin - markerSize/2, startY + height - margin - markerSize/2, markerSize, markerSize, 'F');
  doc.rect(startX + width - margin - markerSize/2, startY + height - markerSize/2, markerSize, markerSize, 'F');
  
  let currentY = startY + margin + 4; // Reduced top spacing
  
  // Add GC Logo if available
  if (logoData) {
    const logoSize = 10; // Bigger logo
    doc.addImage(logoData, 'PNG', startX + (width - logoSize) / 2, currentY, logoSize, logoSize);
    currentY += 11;
  }
  
  // Header
  doc.setFontSize(9); // Larger font
  doc.setFont('helvetica', 'bold');
  doc.text('Gordon College', startX + width / 2, currentY, { align: 'center' });
  currentY += 3; // Reduced spacing
  
  // Name, Date, Class fields - more compact
  doc.setFontSize(7); // Larger font
  doc.setFont('helvetica', 'normal');
  
  const fieldWidth = (width - 2 * margin) / 2 - 1;
  
  // Name field
  doc.text('Name', startX + margin + 1, currentY);
  doc.rect(startX + margin + 10, currentY - 2.5, fieldWidth - 8, 3);
  
  // Date field
  doc.text('Date', startX + width / 2 + 1, currentY);
  doc.rect(startX + width / 2 + 8, currentY - 2.5, fieldWidth - 6, 3);
  
  currentY += 4; // Reduced spacing
  
  // Class and Period
  doc.text('Class', startX + margin + 1, currentY);
  doc.rect(startX + margin + 10, currentY - 2.5, fieldWidth - 8, 3);
  
  doc.text('Period', startX + width / 2 + 1, currentY);
  doc.rect(startX + width / 2 + 10, currentY - 2.5, fieldWidth - 8, 3);
  
  currentY += 3; // Reduced spacing
  
  // Remove Key section to save space
  
  // Student ZipGrade ID section
  doc.setFontSize(6); // Larger font
  doc.setFont('helvetica', 'bold');
  doc.text('Student ZipGrade ID', startX + margin + 1, currentY);
  currentY += 3; // Space after label
  
  // Draw input boxes for writing Student ID
  const idStartX = startX + margin + 7; // More space from edge
  const idColSpacing = 4.5; // More spacing between columns
  const boxWidth = 4; // Width of each box
  const boxHeight = 4; // Height of box
  
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < 10; i++) {
    const boxX = idStartX + i * idColSpacing - boxWidth / 2;
    doc.rect(boxX, currentY, boxWidth, boxHeight); // Draw box for writing
  }
  
  currentY += boxHeight + 2; // Space after boxes
  
  const idRowSpacing = 3.5; // More spacing between rows
  const rowLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']; // Order: 1-9, then 0
  
  doc.setFontSize(6); // Larger font for numbers
  
  // Draw 10 columns for ID - circles with better spacing
  for (let col = 0; col < 10; col++) {
    const x = idStartX + col * idColSpacing;
    
    // Draw 10 rows (1-9, 0)
    for (let row = 0; row < 10; row++) {
      const y = currentY + row * idRowSpacing;
      
      // Row label on the left side
      if (col === 0) {
        doc.setFont('helvetica', 'bold');
        doc.text(rowLabels[row], startX + margin + 1, y + 1); // Left-aligned row numbers
      }
      
      drawBubble(doc, x, y, bubbleSize);
    }
  }
  
  currentY += 10 * idRowSpacing + 4; // More spacing after ID section
  
  // Answer section
  const choices = ['A', 'B', 'C', 'D', 'E'].slice(0, template.choicesPerQuestion);
  const answersPerColumn = questionsPerSheet === 20 ? 10 : 25;
  const numColumns = Math.ceil(questionsPerSheet / answersPerColumn);
  const columnWidth = (width - 2 * margin) / numColumns;
  
  doc.setFontSize(7); // Larger font for answer section
  doc.setFont('helvetica', 'bold');
  
  for (let col = 0; col < numColumns; col++) {
    const startQ = col * answersPerColumn + 1;
    const endQ = Math.min((col + 1) * answersPerColumn, questionsPerSheet);
    const colX = startX + margin + col * columnWidth + 2; // Adjust position
    
    let qY = currentY;
    
    // Column header (A B C D E) - perfectly aligned with bubbles
    const bubbleSpacing = 5; // More spacing between bubbles
    const headerOffset = 6; // Starting offset for first bubble
    doc.setFont('helvetica', 'bold');
    for (let i = 0; i < choices.length; i++) {
      const letterX = colX + headerOffset + i * bubbleSpacing;
      // Center the letter above the bubble
      doc.text(choices[i], letterX, qY - 2, { align: 'center' }); // More space between header and bubbles
    }
    
    qY += 4; // Add space after header before first question
    
    for (let q = startQ; q <= endQ; q++) {
      // Add black square indicator for questions 1, 11, 21, 31, etc. (every 10th)
      const indicatorSize = 2; // Adjusted indicator size
      if (q % 10 === 1) {
        doc.setFillColor(0, 0, 0);
        doc.rect(colX - 2.5, qY - 1, indicatorSize, indicatorSize, 'F'); // Better aligned
      }
      
      // Question number
      doc.setFont('helvetica', 'bold');
      const qNumText = q.toString();
      doc.text(qNumText, colX + (q < 10 ? 1 : 0), qY + 0.5); // Vertically centered with bubbles
      
      // Answer bubbles - circles positioned to match letters
      doc.setFont('helvetica', 'normal');
      for (let i = 0; i < choices.length; i++) {
        const bubbleX = colX + headerOffset + i * bubbleSpacing;
        drawBubble(doc, bubbleX, qY, bubbleSize);
      }
      
      qY += 4.5; // More vertical spacing between questions
    }
  }
  
  // Border around sheet
  doc.rect(startX, startY, width, height);
}

// Draw full page sheet (for 100 questions)
function drawFullSheet(
  doc: jsPDF,
  startX: number,
  startY: number,
  width: number,
  height: number,
  template: TemplateData,
  logoData: string
) {
  const margin = 6; // Reduced margin
  const bubbleSize = 4; // Larger bubbles
  const markerSize = 7;
  
  // Alignment markers - BLACK SQUARES
  doc.setFillColor(0, 0, 0);
  doc.rect(startX + margin - markerSize/2, startY + margin - markerSize/2, markerSize, markerSize, 'F');
  doc.rect(startX + width - margin - markerSize/2, startY + margin - markerSize/2, markerSize, markerSize, 'F');
  doc.rect(startX + margin - markerSize/2, startY + height - margin - markerSize/2, markerSize, markerSize, 'F');
  doc.rect(startX + width - margin - markerSize/2, startY + height - margin - markerSize/2, markerSize, markerSize, 'F');
  
  let currentY = startY + margin + 6; // Reduced spacing
  
  // Add GC Logo if available
  if (logoData) {
    const logoSize = 18; // Larger logo
    doc.addImage(logoData, 'PNG', startX + (width - logoSize) / 2, currentY, logoSize, logoSize);
    currentY += 20;
  }
  
  // Header
  doc.setFontSize(16); // Larger font
  doc.setFont('helvetica', 'bold');
  doc.text('Gordon College', startX + width / 2, currentY, { align: 'center' });
  currentY += 6; // Reduced spacing
  
  // Name and Date fields
  doc.setFontSize(10); // Larger font
  doc.setFont('helvetica', 'normal');
  
  const fieldY = currentY;
  doc.text('Name', startX + margin + 2, fieldY);
  doc.line(startX + margin + 18, fieldY, startX + width / 2 - 5, fieldY);
  
  doc.text('Date', startX + width / 2 + 5, fieldY);
  doc.line(startX + width / 2 + 18, fieldY, startX + width - margin - 2, fieldY);
  
  currentY += 5; // Reduced spacing
  
  // Class and Period
  doc.text('Class', startX + margin + 2, currentY);
  doc.line(startX + margin + 18, currentY, startX + width / 2 - 5, currentY);
  
  doc.text('Period', startX + width / 2 + 5, currentY);
  doc.line(startX + width / 2 + 20, currentY, startX + width - margin - 2, currentY);
  
  currentY += 6; // Reduced spacing
  
  // Student ID section
  doc.setFontSize(10); // Larger font
  doc.setFont('helvetica', 'bold');
  doc.text('Student ZipGrade ID', startX + margin + 2, currentY);
  currentY += 4; // Space after label
  
  // Draw input boxes for writing Student ID
  const idStartX = startX + margin + 18; // More space from edge
  const idColSpacing = 6; // More spacing between columns
  const boxWidth = 5.5; // Width of each box
  const boxHeight = 6; // Height of box
  
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < 10; i++) {
    const boxX = idStartX + i * idColSpacing - boxWidth / 2;
    doc.rect(boxX, currentY, boxWidth, boxHeight); // Draw box for writing
  }
  
  currentY += boxHeight + 3; // Space after boxes
  
  const idRowSpacing = 5.2; // More spacing between rows
  const rowLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']; // Order: 1-9, then 0
  
  doc.setFontSize(9); // Larger font for numbers
  
  // Draw 10 columns for ID - circles with better spacing
  for (let col = 0; col < 10; col++) {
    const x = idStartX + col * idColSpacing;
    
    // Draw 10 rows (1-9, 0)
    for (let row = 0; row < 10; row++) {
      const y = currentY + row * idRowSpacing;
      
      // Row label on the left side
      if (col === 0) {
        doc.setFont('helvetica', 'bold');
        doc.text(rowLabels[row], startX + margin + 8, y + 1.5); // Left-aligned row numbers
      }
      
      drawBubble(doc, x, y, bubbleSize);
    }
  }
  
  currentY += 10 * idRowSpacing + 5; // More spacing after ID
  
  // Answer section - 4 columns of 25 questions each
  const choices = ['A', 'B', 'C', 'D', 'E'].slice(0, template.choicesPerQuestion);
  const questionsPerColumn = 25;
  const numColumns = 4;
  const columnWidth = (width - 2 * margin) / numColumns;
  
  doc.setFontSize(9); // Larger font
  
  for (let col = 0; col < numColumns; col++) {
    const startQ = col * questionsPerColumn + 1;
    const endQ = Math.min((col + 1) * questionsPerColumn, 100);
    const colX = startX + margin + col * columnWidth + 3;
    
    let qY = currentY;
    
    // Column header - perfectly aligned with bubbles
    doc.setFont('helvetica', 'bold');
    const bubbleSpacing = 6; // More spacing between bubbles
    const headerOffset = 10; // Starting offset for first bubble
    for (let i = 0; i < choices.length; i++) {
      const letterX = colX + headerOffset + i * bubbleSpacing;
      // Center the letter above the bubble
      doc.text(choices[i], letterX, qY - 3, { align: 'center' }); // More space between header and bubbles
    }
    
    qY += 5; // Add space after header before first question
    
    for (let q = startQ; q <= endQ; q++) {
      // Add black square indicator for questions 1, 11, 21, 31, etc. (every 10th)
      const indicatorSize = 2.5; // Adjusted indicator size
      if (q % 10 === 1) {
        doc.setFillColor(0, 0, 0);
        doc.rect(colX - 3, qY - 1.2, indicatorSize, indicatorSize, 'F'); // Better aligned
      }
      
      doc.setFont('helvetica', 'bold');
      const qNumText = q.toString();
      doc.text(qNumText, colX + (q < 10 ? 2 : 0), qY + 1); // Vertically centered with bubbles
      
      // Answer bubbles - larger circles with better alignment
      doc.setFont('helvetica', 'normal');
      for (let i = 0; i < choices.length; i++) {
        const bubbleX = colX + headerOffset + i * bubbleSpacing;
        drawBubble(doc, bubbleX, qY, bubbleSize);
      }
      
      qY += 5.5; // More vertical spacing between questions
    }
  }
  
  // Footer
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'Do not fold, staple, or tear this answer sheet.',
    startX + width / 2,
    startY + height - 5,
    { align: 'center' }
  );
}
