import { Music2, Mic2, Drama, PersonStanding, Church, Sparkles, type LucideProps } from "lucide-react";
import type { VerticalIcon as VerticalIconKey } from "@/lib/verticals";

const ICONS: Record<VerticalIconKey, React.ComponentType<LucideProps>> = {
  orchestra: Music2,
  choir: Mic2,
  theatre: Drama,
  dance: PersonStanding,
  church: Church,
  agency: Sparkles,
};

export function VerticalIcon({ name, ...props }: { name: VerticalIconKey } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon {...props} />;
}
