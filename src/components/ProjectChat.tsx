
"use client";

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MessageSquare } from 'lucide-react';

export function ProjectChat({ projectId }: { projectId: string }) {
  return (
     <Alert>
        <MessageSquare className="h-4 w-4" />
        <AlertTitle>Chat Disabled</AlertTitle>
        <AlertDescription>
            This feature is temporarily disabled.
        </AlertDescription>
    </Alert>
  );
}
