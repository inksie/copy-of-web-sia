# Mobile Scanner Improvements

## Recent Updates

### Null Logic and Threshold Calibration for ID Detection (March 2026)

**Problem 1:** The system detected a "0" in an unshaded column, corrupting the ID from 9 digits to 10. This happened because unshaded columns were defaulting to numeric zero.

**Problem 2:** The system was overly sensitive to the empty grid (background noise), yet struggled with light intentional marks.

**Solution Implemented:**

1. **Null Logic for Unshaded Columns**
   - Columns with no shaded bubble now return `-1` internally (instead of `0`)
   - The digit '0' is ONLY returned if the '0' bubble is actually shaded
   - Unshaded columns are represented as '_' in debug logs
   - Final ID string only includes detected digits (unshaded columns stripped)
   - This prevents 9-digit IDs from becoming 10-digit due to false zeros

2. **70% Detection Threshold Calibration**
   - Primary threshold: darkest bubble must be < 70% of unfilled brightness (was 65%)
   - This is stricter to avoid false positives from dots or background noise
   - Secondary detection: requires 15% gap from 2nd darkest AND < 85% brightness (was 12% gap, 80%)
   - This catches intentional light marks while rejecting noise

3. **Double-Shade Detection Update**
   - Threshold increased to 75% (was 70%) for second bubble
   - Gap threshold increased to 8% (was 6%) 
   - Reduces false multiple-answer detections from uneven backgrounds

### 100-Item Template Marker Detection Fix (March 2026)

**Problem:** For 100-item templates, the bottom-left (BL) marker was being detected incorrectly in the middle of the page. This happened because the bottom markers are at 75% page height (not at the bottom), and the scoring algorithm preferred larger rectangles.

**Solution Implemented:**
1. **Template-Aware Marker Detection** - `findCornerMarkers()` now accepts `templateType` parameter
2. **Position Bonus for 100-Item** - Bottom markers at 95%+ of image height are penalized (likely wrong)
3. **Frame Height Validation** - Marker frames smaller than 35% of image are penalized
4. **Increased Skew Tolerance** - Changed from 8% to 15% edge alignment tolerance

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
