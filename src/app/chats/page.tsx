
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MessageSquare } from 'lucide-react';


const ChatsPage: NextPage = () => {

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4 flex flex-col items-center justify-center">
         <Alert className="max-w-md">
            <MessageSquare className="h-4 w-4" />
            <AlertTitle>Feature Temporarily Disabled</AlertTitle>
            <AlertDescription>
              The chat and video call functionality is currently undergoing maintenance. We'll bring it back soon!
            </AlertDescription>
          </Alert>
      </main>
    </div>
  );
};

export default ChatsPage;
