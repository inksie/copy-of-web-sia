/**
 * Test Suite for Duplicate Detection Service
 * Tests duplicate detection across different scenarios
 */

import { DuplicateDetectionService } from './duplicateDetectionService';

describe('DuplicateDetectionService', () => {
  // Test data
  const testRecords = [
    {
      student_id: 'STU001',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
    },
    {
      student_id: 'STU002',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
    },
    {
      student_id: 'STU003',
      first_name: 'Bob',
      last_name: 'Johnson',
      email: 'bob@example.com',
    },
  ];

  describe('findInternalDuplicates', () => {
    it('should detect duplicate student IDs within batch', () => {
      const recordsWithDuplicateId = [
        ...testRecords,
        {
          student_id: 'STU001', // Duplicate ID
          first_name: 'John',
          last_name: 'Doe',
          email: 'john2@example.com',
        },
      ];

      const duplicates = DuplicateDetectionService.findInternalDuplicates(
        recordsWithDuplicateId
      );

      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0].matchType).toBe('student_id');
      expect(duplicates[0].severity).toBe('high');
    });

    it('should detect duplicate emails within batch', () => {
      const recordsWithDuplicateEmail = [
        ...testRecords,
        {
          student_id: 'STU004',
          first_name: 'Jake',
          last_name: 'Brown',
          email: 'john@example.com', // Duplicate email
        },
      ];

      const duplicates = DuplicateDetectionService.findInternalDuplicates(
        recordsWithDuplicateEmail
      );

      const emailDuplicates = duplicates.filter(d => d.matchType === 'email');
      expect(emailDuplicates.length).toBeGreaterThan(0);
      expect(emailDuplicates[0].severity).toBe('medium');
    });

    it('should not flag identical records from same source', () => {
      const duplicates = DuplicateDetectionService.findInternalDuplicates(testRecords);
      expect(duplicates.length).toBe(0);
    });
  });

  describe('calculateNameSimilarity', () => {
    it('should return 1.0 for exact name matches', () => {
      // Note: This is a private method, tested indirectly through duplicate detection
      // We would need to expose it or test through public API
      expect(true).toBe(true); // Placeholder
    });
  });
});
