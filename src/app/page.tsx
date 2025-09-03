
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Sparkles, Users, Code, Goal, Terminal, Frown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Project } from '@/lib/types';
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ProjectCard } from '@/components/ProjectCard';
import { useAuth } from '@/hooks/useAuth';

const FeaturedProjects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
        setLoading(false);
        return;
    }

    const fetchProjects = async () => {
      setLoading(true);
      try {
        const projectsCollection = collection(db, 'projects');
        const q = query(projectsCollection);
        const querySnapshot = await getDocs(q);
        const projectsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        
        // Since the ProjectCard expects matchingSkills, we'll add it.
        // In this simplified view, all project skills can be considered "matching".
        const projectsForCard = projectsData.map(p => ({
            ...p,
            projectId: p.id,
            matchingSkills: p.tags || []
        }));

        setProjects(projectsForCard.slice(0, 3)); // Show only 3 featured projects
      } catch (err) {
        console.error("Error fetching projects:", err);
        setError("Failed to load featured projects.");
      }
      setLoading(false);
    };

    fetchProjects();
  }, [user, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {[...Array(3)].map((_, i) => (
           <div key={i} className="flex flex-col space-y-3">
            <Skeleton className="h-[200px] w-full rounded-lg" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!user) {
       return (
         <Alert>
            <Frown className="h-4 w-4" />
            <AlertTitle>Please Log In</AlertTitle>
            <AlertDescription>
            You need to be logged in to view featured projects.
            <Button asChild variant="link" className="p-0 h-auto ml-1"><Link href="/login">Login here.</Link></Button>
            </AlertDescription>
        </Alert>
       )
  }

  if (error) {
    return (
       <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (projects.length === 0) {
    return (
      <Alert>
        <Terminal className="h-4 w-4" />
        <AlertTitle>No projects found!</AlertTitle>
        <AlertDescription>Create a new project to see it featured here.</AlertDescription>
      </Alert>
    );
  }


  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  )
}


const Home: NextPage = () => {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
         <section className="text-center mb-24 mt-12">
           <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground/80 to-foreground">
            Find Your Squad.
          </h1>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground/80 to-foreground mb-6">
            Build The Future.
          </h1>
          <p className="max-w-3xl mx-auto text-lg text-muted-foreground mb-8">
            SquadUp is the ultimate platform for students to connect, collaborate on projects, and bring innovative ideas to life. Stop searching, start creating.
          </p>
          <Button size="lg" asChild className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:scale-105 transition-transform">
              <Link href="/projects">Explore Projects</Link>
          </Button>
        </section>

        <section className="grid md:grid-cols-3 gap-8 text-center mb-16">
          <Card>
            <CardHeader>
              <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit mb-2">
                  <Users className="w-8 h-8 text-primary" />
              </div>
              <CardTitle>Connect & Collaborate</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Find like-minded students from various disciplines. Form diverse squads to tackle ambitious projects.
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
               <div className="mx-auto bg-accent/10 p-4 rounded-full w-fit mb-2">
                  <Code className="w-8 h-8 text-accent" />
              </div>
              <CardTitle>Build Your Portfolio</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Gain real-world experience by working on exciting projects. Showcase your skills and build a strong portfolio.
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
               <div className="mx-auto bg-secondary/20 p-4 rounded-full w-fit mb-2">
                  <Goal className="w-8 h-8 text-secondary-foreground" />
              </div>
              <CardTitle>Launch Your Ideas</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Have a brilliant project idea? Assemble a team with the right skills and turn your vision into reality.
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="flex items-center gap-4 mb-8">
             <Sparkles className="text-primary w-8 h-8"/>
            <h2 className="text-3xl font-bold tracking-tight">Featured Projects</h2>
          </div>
          <FeaturedProjects />
        </section>
      </main>
    </div>
  );
};

export default Home;
