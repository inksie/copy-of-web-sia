'use client';

import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import OMRScanner from '@/components/scanning/OMRScanner';
import { use } from 'react';

export default function ScanPapersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <ProtectedLayout>
      <OMRScanner examId={id} />
    </ProtectedLayout>
  );
}
