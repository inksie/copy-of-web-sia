# Mobile Scanner Improvements

## Recent Updates

### Skew Detection and Correction (March 2026)

**Problem:** When sheets were slightly skewed or rotated (up to 30°), marker detection was inconsistent and student ID/answers were not correctly detected.

**Solution Implemented:**
1. **Automatic Skew Detection** - Added `detectSkewAngle()` function that uses Sobel edge detection to analyze dominant edge directions in the image. It detects rotation angles up to ±30°.

2. **Automatic Skew Correction** - Added `rotateCanvas()` function that rotates the captured image to correct the detected skew before marker detection.

3. **Enhanced Preprocessing Pipeline** - The image processing now follows this order:
   - Skew correction (new)
   - Adaptive brightness enhancement
   - Corner marker detection
   - Bubble reading

4. **Expanded Search Regions** - Live frame marker detection now searches larger regions (30% instead of 20%) to accommodate rotated sheets.

### Improved Error Classification (March 2026)

**Problem:** When markers were not fully visible due to improper alignment, the system displayed incorrect error messages like "Multiple bubbles shaded in student ID" instead of indicating alignment issues.

**Solution Implemented:**
1. **Alignment Error State** - Added `alignmentError` state variable to track sheet alignment issues separately from other errors.

2. **Marker Confidence Score** - Added confidence scoring to marker detection:
   - Returns `found: boolean` indicating if all 4 markers were detected
   - Returns `confidence: number` (0-1) indicating detection quality
   - Low confidence (< 0.5) triggers alignment warnings

3. **Prioritized Error Display** - Alignment errors are now displayed with higher priority:
   - Shows "Sheet Alignment Error" with a prominent red banner
   - Provides actionable tips (ensure corners visible, hold steady, avoid shadows)
   - Includes "Retake Photo" button for quick retry

4. **Context-Aware ID Errors** - When alignment issues are detected alongside ID problems:
   - Multiple bubble detection errors are suppressed (alignment is the root cause)
   - ID not found errors include alignment warning if markers were unreliable
   - Prevents misleading "Multiple bubbles shaded" messages when the real issue is alignment

### UI Improvements

1. **Alignment Error Card** - New prominent error display with:
   - Red background to indicate critical issue
   - Clear explanation of the problem
   - "Retake Photo" button
   - Tips for better photo capture

2. **Debug Info Enhancement** - Added marker confidence percentage to debug overlay for troubleshooting.

## Technical Details

### Skew Detection Algorithm

The skew detection uses a Hough-like approach:
1. Apply Sobel operators to detect edge gradients
2. Calculate edge direction angles for strong edges
3. Accumulate angles in a histogram (-30° to +30°)
4. Find peak angle with Gaussian smoothing
5. Only apply correction if peak strength is significant

### Marker Confidence Calculation

Confidence is calculated based on:
- Average individual marker scores (contrast × size)
- Rectangle quality (width/height ratio consistency)
- Values normalized to 0-1 range

### Files Modified
- `src/components/scanning/OMRScanner.tsx`
  - Added `alignmentError` state
  - Added `detectSkewAngle()` function
  - Added `rotateCanvas()` function  
  - Added `correctSkew()` function
  - Updated `findCornerMarkers()` to return confidence
  - Updated `detectBubbles()` to return marker status
  - Updated `processImage()` with skew correction and error classification
  - Added alignment error UI display
  - Expanded live marker detection regions
