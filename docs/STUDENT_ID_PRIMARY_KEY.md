# Task SS2 7.1: Enforce Student ID as Primary Key
## Implementation Guide

### Overview
This document outlines the enforcement of Student ID as the primary key across all modules in the SIA system. Student ID is now the unique identifier for all student-related operations.

---

## 1. Database Schema Updates

### Primary Key Definition
- **Collection**: `students`
- **Primary Key Field**: `student_id` (String)
- **Document ID**: Uses `student_id` as the document key for O(1) lookups

### Core Collections & Relationships

#### 1.1 Students Collection
```javascript
students/
├── {student_id}/
│   ├── student_id: string (PK)
│   ├── first_name: string
│   ├── last_name: string
│   ├── email?: string
│   ├── phone?: string
│   ├── enrolled_classes: string[] (FK references)
│   ├── created_at: timestamp
│   ├── updated_at: timestamp
│   └── created_by: string
```

#### 1.2 Student Enrollments Collection
```javascript
studentEnrollments/
├── {student_id}_{class_id}/
│   ├── student_id: string (FK → students.student_id)
│   ├── class_id: string (FK → classes.id)
│   ├── enrolled_date: timestamp
│   └── status: 'active' | 'inactive' | 'dropped'
```

#### 1.3 Student Exam Results Collection
```javascript
studentExamResults/
├── {result_id}/
│   ├── result_id: string (PK)
│   ├── student_id: string (FK → students.student_id)
│   ├── exam_id: string (FK → exams.id)
│   ├── score: number
│   ├── total_questions: number
│   ├── answers: string[]
│   ├── scanned_at: timestamp
│   ├── scanned_by: string
│   ├── is_null_id: boolean
│   └── archived?: boolean
```

#### 1.4 Classes Collection (Updated)
```javascript
classes/
├── {class_id}/
│   ├── id: string (PK)
│   ├── class_name: string
│   ├── course_subject: string
│   ├── section_block: string
│   ├── room?: string
│   ├── student_ids: string[] (FK array → students.student_id)
│   ├── created_at: timestamp
│   ├── created_by: string
│   └── updated_at: timestamp
```

#### 1.5 Exams Collection (Updated)
```javascript
exams/
├── {exam_id}/
│   ├── id: string (PK)
│   ├── title: string
│   ├── subject: string
│   ├── num_items: number
│   ├── student_id_length?: number
│   ├── answers: string[]
│   ├── created_at: timestamp
│   ├── created_by: string
│   └── updated_at: timestamp
```

---

## 2. Constraint Implementation

### 2.1 Primary Key Constraint
- **Enforcement Level**: Application-level (Firestore does not support native PK constraints)
- **Method**: Unique index on `student_id` field in students collection
- **Validation**: Check before creation/update in `StudentService.validateStudentId()`

### 2.2 Foreign Key Constraints
- **Method**: Store student_id as string reference in related documents
- **Validation**: Verify referenced student exists before creating relationships
- **Cascading**: Implemented in `StudentService.deleteStudent()` to handle cascading operations

### 2.3 Uniqueness Enforcement
```typescript
// Before creating a student
const existing = await StudentService.getStudentById(student_id);
if (existing) {
  throw new Error(`Student ID "${student_id}" already exists`);
}
```

---

## 3. Implementation Checklist

### 3.1 Data Layer ✅
- [x] Create StudentService with PK enforcement
- [x] Implement Student CRUD operations
- [x] Add duplicate detection
- [x] Implement cascading deletes
- [x] Add enrollment management
- [x] Add exam result tracking
- [x] Bulk create with error handling

### 3.2 References Update
- [ ] Update ClassService to use student_id instead of Student objects
- [ ] Update ExamService for exam result references
- [ ] Update ScanningService to use student_id as FK
- [ ] Update StudentRosterService to validate student_id references
- [ ] Update StudentIDService to work with StudentService

### 3.3 Component Updates (UI)
- [ ] Update StudentClasses component to use StudentService
- [ ] Update ClassManagement component to use StudentService
- [ ] Update student add/edit dialogs to validate unique student_id
- [ ] Update import functionality to enforce uniqueness
- [ ] Add student lookup by ID functionality

### 3.4 Type Definitions
- [ ] Update Student interface to mark student_id as required
- [ ] Update Class interface to use student_id array
- [ ] Create StudentRecord interface (done in StudentService)
- [ ] Add StudentEnrollment interface (done in StudentService)
- [ ] Add StudentExamResult interface (done in StudentService)

### 3.5 Validation & Error Handling
- [ ] Add student_id format validation
- [ ] Add duplicate ID detection on import
- [ ] Add null/empty ID handling
- [ ] Add cascade delete warnings
- [ ] Add transaction rollback on failure

### 3.6 Database Indexes
- [ ] Create index on `students.student_id` (unique)
- [ ] Create index on `studentEnrollments.student_id`
- [ ] Create index on `studentEnrollments.class_id`
- [ ] Create index on `studentExamResults.student_id`
- [ ] Create index on `studentExamResults.exam_id`

### 3.7 Testing
- [ ] Unit test: Create student with duplicate ID (should fail)
- [ ] Unit test: Get student by ID (O(1) lookup)
- [ ] Unit test: Enroll student in class
- [ ] Unit test: Record exam result
- [ ] Unit test: Delete student with cascading
- [ ] Integration test: Full workflow (create → enroll → exam → result)

---

## 4. Migration Path (For Existing Data)

### Step 1: Backup
```javascript
// Export all student data before migration
```

### Step 2: Denormalization
```typescript
// Move student objects to separate collection
const students = await migrationService.extractStudents();
```

### Step 3: Update References
```typescript
// Update classes to reference student_id instead of student objects
const classes = await migrationService.updateClassReferences(students);
```

### Step 4: Verify Integrity
```typescript
// Ensure all references point to valid student IDs
const validation = await migrationService.validateReferences();
```

---

## 5. Usage Examples

### Create Student
```typescript
const student = await StudentService.createStudent(
  '2024STU001',
  'John',
  'Doe',
  'john@example.com',
  userId
);
```

### Enroll Student
```typescript
await StudentService.enrollStudentInClass('2024STU001', 'class_123');
```

### Record Exam Result
```typescript
await StudentService.recordExamResult(
  'exam_456',
  '2024STU001',
  95,
  ['A', 'B', 'C'],
  userId
);
```

### Get All Results
```typescript
const results = await StudentService.getStudentExamResults('2024STU001');
```

### Delete Student (with cascade)
```typescript
await StudentService.deleteStudent('2024STU001', userId);
```

---

## 6. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Students collection - PK enforcement
    match /students/{student_id} {
      allow read: if request.auth != null;
      allow create: if request.auth != null 
        && request.resource.data.student_id == student_id
        && !exists(/databases/$(database)/documents/students/$(student_id));
      allow update: if request.auth != null 
        && !('student_id' in request.resource.data.diff(resource.data))
        && request.auth.uid == resource.data.created_by;
      allow delete: if request.auth != null 
        && request.auth.uid == resource.data.created_by;
    }

    // Enrollments - FK validation
    match /studentEnrollments/{document=**} {
      allow read: if request.auth != null;
      allow create: if request.auth != null 
        && exists(/databases/$(database)/documents/students/$(request.resource.data.student_id));
      allow update: if request.auth != null;
      allow delete: if request.auth != null;
    }

    // Exam Results - FK validation
    match /studentExamResults/{document=**} {
      allow read: if request.auth != null;
      allow create: if request.auth != null 
        && exists(/databases/$(database)/documents/students/$(request.resource.data.student_id));
      allow update: if request.auth != null;
      allow delete: if request.auth != null;
    }
  }
}
```

---

## 7. Performance Implications

### Advantages
- ✅ O(1) student lookups (document ID = student_id)
- ✅ Reduced query complexity
- ✅ Better indexing efficiency
- ✅ Prevents duplicate student IDs at application level
- ✅ Clearer data relationships

### Considerations
- Query classes by student_id now requires index on studentEnrollments
- Class student list queries need to join with students collection
- Import operations need pre-validation for duplicates

---

## 8. Deprecation & Migration

### Deprecated Patterns
- ❌ Storing Student objects in classes.students array
- ❌ Using auto-generated IDs for student identification
- ❌ Loose student_id references without validation

### New Patterns
- ✅ Use student_id as universal identifier
- ✅ Store only student_id in references
- ✅ Validate student_id existence before creating relationships
- ✅ Use StudentService for all student operations

---

## 9. Monitoring & Validation

### Data Integrity Checks
```typescript
// Verify all exam results reference existing students
async function validateExamResultIntegrity() {
  const results = await getAllExamResults();
  for (const result of results) {
    const student = await StudentService.getStudentById(result.student_id);
    if (!student) console.warn(`Orphaned result: ${result.result_id}`);
  }
}
```

### Duplicate Detection
```typescript
// Check for any duplicate student IDs
async function findDuplicateStudents() {
  const allStudents = await getAllStudents();
  const idCounts = new Map();
  for (const student of allStudents) {
    idCounts.set(student.student_id, (idCounts.get(student.student_id) || 0) + 1);
  }
  return Array.from(idCounts.entries()).filter(([_, count]) => count > 1);
}
```

---

## 10. Summary

This implementation establishes Student ID as the single source of truth for student identification across the SIA system:

1. **Primary Key**: student_id is stored as the Firestore document ID
2. **Foreign Keys**: All references use student_id string
3. **Constraints**: Enforced at application level with validation
4. **Cascading**: Delete operations cascade to enrollments and results
5. **Performance**: Optimized for O(1) lookups and efficient queries

All student-related operations must now go through `StudentService` to maintain data integrity.
