
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight, Users, Frown } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TeamMember {
  userId: string;
  role: string;
}

interface Team {
  id: string;
  projectId: string;
  teamName: string;
  members: TeamMember[];
}


const TeamDetailPage: NextPage<{ params: { id: string } }> = ({ params }) => {
  const { id } = React.use(params);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeam = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const teamDocRef = doc(db, 'teams', id);
        const teamDoc = await getDoc(teamDocRef);

        if (teamDoc.exists()) {
          setTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
        } else {
          console.error('No such team document!');
        }
      } catch (error) {
        console.error('Error fetching team:', error);
      }
      setLoading(false);
    };

    fetchTeam();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4">
           <div className="max-w-4xl mx-auto">
              <Skeleton className="h-12 w-3/4 mx-auto mb-2" />
              <Skeleton className="h-6 w-1/2 mx-auto mb-8" />
              <Skeleton className="h-10 w-40 mb-8" />
              <Card>
                  <CardHeader>
                      <Skeleton className="h-8 w-1/3 mb-2" />
                      <Skeleton className="h-4 w-2/3" />
                  </CardHeader>
                  <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        {[...Array(3)].map((_, i) => (
                           <Card key={i} className="p-4 flex flex-col items-center text-center">
                              <Skeleton className="h-20 w-20 rounded-full mb-3" />
                              <Skeleton className="h-5 w-20 mb-1" />
                              <Skeleton className="h-4 w-16" />
                              <Skeleton className="h-8 w-24 mt-2" />
                           </Card>
                        ))}
                      </div>
                  </CardContent>
              </Card>
            </div>
        </main>
      </div>
    );
  }

  if (!team) {
     return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4 text-center">
          <Alert variant="destructive" className="max-w-lg mx-auto">
            <Frown className="h-4 w-4" />
            <AlertTitle>Team Not Found</AlertTitle>
            <AlertDescription>
              This team either does not exist or has been deleted.
            </AlertDescription>
          </Alert>
           <Button asChild className="mt-4">
            <Link href="/teams">Back to Teams</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
                <h1 className="text-5xl font-extrabold tracking-tight">{team.teamName}</h1>
                <p className="text-xl text-muted-foreground mt-2">The official squad for the project.</p>
            </div>

            <Button asChild variant="outline" className="mb-8 group">
                <Link href={`/projects/${team.projectId}`}>
                    View Project <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
            </Button>
            
            <Card>
                <CardHeader>
                    <CardTitle>Squad Members</CardTitle>
                    <CardDescription>The talented individuals making this project a reality.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        {team.members.map(member => (
                            <Card key={member.userId} className="p-4 flex flex-col items-center text-center">
                                 <Avatar className="h-20 w-20 mb-3">
                                    <AvatarImage src={`https://picsum.photos/seed/user-${member.userId}/100`} alt={member.userId} data-ai-hint="profile photo" />
                                    <AvatarFallback>{member.userId.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <p className="font-bold">User ...{member.userId.slice(-4)}</p>
                                <p className="text-sm text-primary">{member.role}</p>
                                <Button asChild variant="link" size="sm" className="mt-2">
                                    <Link href={`/profiles/${member.userId}`}>View Profile</Link>
                                </Button>
                            </Card>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
};

export default TeamDetailPage;
