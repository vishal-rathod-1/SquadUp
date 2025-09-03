import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const skillColorMap: { [key: string]: string } = {
  'AI': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'TypeScript': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  'Genkit': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'React Native': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'JavaScript': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'Mobile Development': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'Next.js': 'bg-gray-400/20 text-gray-200 border-gray-400/30',
  'Web Development': 'bg-green-500/20 text-green-300 border-green-500/30',
  'Python': 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  'Tableau': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'Data Analysis': 'bg-pink-500/20 text-pink-300 border-pink-500/30',
};

export function SkillBadge({ skill }: { skill: string }) {
  const colorClass = skillColorMap[skill] || 'bg-secondary text-secondary-foreground';
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        colorClass
      )}
    >
      {skill}
    </Badge>
  );
}
