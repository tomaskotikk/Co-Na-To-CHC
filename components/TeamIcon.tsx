import {
  Bird,
  Bug,
  Cat,
  Coffee,
  Crown,
  Dog,
  Fish,
  Flame,
  Gem,
  Ghost,
  Rabbit,
  Rocket,
  Squirrel,
  Star,
  Turtle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { TeamIconName } from "@/lib/types";

const ICONS: Record<TeamIconName, LucideIcon> = {
  rocket: Rocket,
  flame: Flame,
  crown: Crown,
  ghost: Ghost,
  zap: Zap,
  gem: Gem,
  cat: Cat,
  dog: Dog,
  bird: Bird,
  fish: Fish,
  rabbit: Rabbit,
  turtle: Turtle,
  squirrel: Squirrel,
  bug: Bug,
  star: Star,
  coffee: Coffee,
};

/** avatar týmu — ikona (velikost dědí z font-size rodiče) */
export function TeamIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name as TeamIconName] ?? Star;
  return <Icon className={`ti ${className ?? ""}`} strokeWidth={2.4} aria-hidden />;
}
