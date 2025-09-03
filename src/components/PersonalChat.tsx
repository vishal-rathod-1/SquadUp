
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Video } from 'lucide-react';

export function PersonalChat({ chatId }: { chatId: string }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Direct Message</CardTitle>
      </CardHeader>
      <CardContent>
         <Alert>
            <Video className="h-4 w-4" />
            <AlertTitle>Chat Disabled</AlertTitle>
            <AlertDescription>
              This feature is temporarily disabled.
            </AlertDescription>
          </Alert>
      </CardContent>
    </Card>
  );
}
