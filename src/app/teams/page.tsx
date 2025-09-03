
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Users, Frown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

interface Team {
  id: string;
  projectId: string;
  teamName: string;
  members: { userId: string; role: string }[];
}

const TeamsPage: NextPage = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if(authLoading) return;
    if(!user) {
      router.push('/login?message=Please log in to view teams.');
      return;
    }
    const fetchTeams = async () => {
      setLoading(true);
      try {
        const teamsCollection = collection(db, 'teams');
        const q = query(teamsCollection);
        const querySnapshot = await getDocs(q);
        const teamsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
        setTeams(teamsData);
      } catch (error) {
        console.error("Error fetching teams:", error);
      }
      setLoading(false);
    };

    fetchTeams();
  }, [user, authLoading, router]);

  if (loading || authLoading || !user) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-full" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
        <h1 className="text-4xl font-bold mb-8">All Teams</h1>
        {teams.length === 0 ? (
          <Alert>
            <Users className="h-4 w-4" />
            <AlertTitle>No Teams Found</AlertTitle>
            <AlertDescription>
              Create a new project to automatically generate a team.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {teams.map(team => (
              <Card key={team.id}>
                <CardHeader>
                  <CardTitle>{team.teamName}</CardTitle>
                  <CardDescription>For project ID: {team.projectId}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center">
                      <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                      <p className="font-semibold">{team.members.length} Member{team.members.length !== 1 ? 's' : ''}</p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full">
                    <Link href={`/teams/${team.id}`}>View Team</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeamsPage;
