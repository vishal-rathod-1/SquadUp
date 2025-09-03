
'use client';
import type { NextPage } from 'next';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Frown, Search } from 'lucide-react';
import Link from 'next/link';
import type { Project } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';

const ProjectsPage: NextPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
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
        setProjects(projectsData);
      } catch (error) {
        console.error("Error fetching projects:", error);
      }
      setLoading(false);
    };

    fetchProjects();
  }, [user, authLoading]);

  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
        const titleMatch = project.title && project.title.toLowerCase().includes(searchTerm.toLowerCase());
        const tagMatch = project.tags && project.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
        return titleMatch || tagMatch;
    });
  }, [projects, searchTerm]);


  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex-1">
            <h1 className="text-4xl font-bold">Projects</h1>
            <p className="text-muted-foreground">Find and collaborate on exciting student-led projects.</p>
          </div>
          <Button asChild>
            <Link href="/projects/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </Button>
        </div>

        <div className="mb-8">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search by title or skill..."
                    className="pl-8 w-full md:w-1/3"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>
        
        {(loading || authLoading) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-6 w-1/4" />
                  </div>
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : !user ? (
            <Alert>
                <Frown className="h-4 w-4" />
                <AlertTitle>Please Log In</AlertTitle>
                <AlertDescription>
                You need to be logged in to view the available projects.
                <Button asChild variant="link" className="p-0 h-auto ml-1"><Link href="/login">Login here.</Link></Button>
                </AlertDescription>
            </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProjects.map((project) => (
              <Card key={project.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle>{project.title}</CardTitle>
                    <Badge variant={project.status === 'open' ? 'default' : 'secondary'}>{project.status}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <div className="flex flex-wrap gap-2">
                    {(project.tags || []).map((tag: string) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/projects/${project.id}`}>View Project</Link>
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

export default ProjectsPage;
