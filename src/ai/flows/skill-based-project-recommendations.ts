'use server';
/**
 * @fileOverview A skill-based project recommendation AI agent.
 *
 * - recommendProjects - A function that handles the project recommendation process.
 * - RecommendProjectsInput - The input type for the recommendProjects function.
 * - RecommendProjectsOutput - The return type for the recommendProjects function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { getFirebaseApp } from '@/lib/firebase';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import type { Project } from '@/lib/types';


const RecommendProjectsInputSchema = z.object({
  userId: z.string().describe('The ID of the user to recommend projects for.'),
  userSkills: z.array(z.string()).describe('The skills of the user.'),
});
export type RecommendProjectsInput = z.infer<typeof RecommendProjectsInputSchema>;

const RecommendProjectsOutputSchema = z.array(z.object({
  projectId: z.string().describe('The ID of the recommended project.'),
  title: z.string().describe('The title of the recommended project.'),
  description: z.string().describe('The description of the recommended project.'),
  matchingSkills: z.array(z.string()).describe('The skills that match the user\'s skills.'),
  tags: z.array(z.string()).describe('The tags associated with the project.'),
}));
export type RecommendProjectsOutput = z.infer<typeof RecommendProjectsOutputSchema>;

export async function recommendProjects(input: RecommendProjectsInput): Promise<RecommendProjectsOutput> {
  return recommendProjectsFlow(input);
}

const recommendProjectsFlow = ai.defineFlow(
  {
    name: 'recommendProjectsFlow',
    inputSchema: RecommendProjectsInputSchema,
    outputSchema: RecommendProjectsOutputSchema,
  },
  async input => {
    // Initialize Firebase Admin for server-side access
    const app = getFirebaseApp();
    const db = getFirestore(app);

    // Fetch all projects from Firestore
    const projectsCollection = collection(db, 'projects');
    const projectSnapshot = await getDocs(projectsCollection);
    const projects: Partial<Project>[] = projectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));


    // Filter projects based on user skills
    const recommendedProjects = projects.filter(project => {
      return project.tags?.some(skill => input.userSkills.includes(skill));
    }).map(project => {
      return {
        projectId: project.id!,
        title: project.title!,
        description: project.description!,
        tags: project.tags!,
        matchingSkills: project.tags!.filter(skill => input.userSkills.includes(skill)),
      };
    });
    
    return recommendedProjects;
  }
);
