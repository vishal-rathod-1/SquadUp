import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { SkillBadge } from './SkillBadge';
import { Button } from './ui/button';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Project {
  projectId: string;
  title: string;
  description: string;
  tags: string[];
}
interface ProjectCardProps {
  project: Project & { matchingSkills: string[] };
  className?: string;
}

export function ProjectCard({ project, className }: ProjectCardProps) {
  const imageIndex = parseInt(project.projectId.replace(/[^0-9]/g, '').slice(-4) || "0", 10) % 4;
  const imageHints = ["coding collaboration", "team meeting", "design sketch", "data analytics"];
  const imageUrls = [
    "https://picsum.photos/seed/project1/600/400",
    "https://picsum.photos/seed/project2/600/400",
    "https://picsum.photos/seed/project3/600/400",
    "https://picsum.photos/seed/project4/600/400",
  ]
  return (
    <Card className={cn("flex flex-col overflow-hidden transform transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/20", className)}>
      <CardHeader className="p-0">
        <div className="relative h-48 w-full">
          <Image
            src={imageUrls[imageIndex]}
            alt={project.title || "Project Image"}
            fill
            className="object-cover"
            data-ai-hint={imageHints[imageIndex]}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
           <div className="absolute bottom-4 left-4">
             <CardTitle className="text-primary-foreground text-2xl font-bold ">{project.title}</CardTitle>
           </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-6">
        <CardDescription>{project.description}</CardDescription>
        <div className="mt-4">
          <h4 className="font-semibold text-sm mb-2 text-foreground">Skills:</h4>
          <div className="flex flex-wrap gap-2">
            {(project.tags || []).map((skill) => (
              <SkillBadge key={skill} skill={skill} />
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="default" asChild className="w-full group bg-gradient-to-r from-primary to-accent text-primary-foreground hover:scale-105 transition-transform">
          <Link href={`/projects/${project.projectId}`}>
            View Project
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
