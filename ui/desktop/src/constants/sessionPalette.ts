/**
 * Curated palette and icon set for per-session UI tagging.
 *
 * Each entry's `id` is what gets persisted in SessionUiMetadata. Keep
 * these lists short and stable — they are user-facing labels, not
 * fine-grained styling.
 */

import {
  Briefcase,
  Code,
  Bug,
  FileText,
  BookOpen,
  PenLine,
  Mail,
  Calendar,
  Target,
  Search,
  Lightbulb,
  Heart,
  Star,
  Flag,
  Sparkles,
  Coffee,
  Globe,
  Music,
  ShoppingBag,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface SessionColor {
  id: string;
  label: string;
  /** Tailwind background class for the small indicator dot. */
  dotClass: string;
}

export const SESSION_COLORS: SessionColor[] = [
  { id: 'red', label: 'Red', dotClass: 'bg-red-500' },
  { id: 'orange', label: 'Orange', dotClass: 'bg-orange-500' },
  { id: 'amber', label: 'Amber', dotClass: 'bg-amber-500' },
  { id: 'green', label: 'Green', dotClass: 'bg-emerald-500' },
  { id: 'blue', label: 'Blue', dotClass: 'bg-blue-500' },
  { id: 'purple', label: 'Purple', dotClass: 'bg-purple-500' },
  { id: 'pink', label: 'Pink', dotClass: 'bg-pink-500' },
];

export function findSessionColor(id: string | undefined): SessionColor | undefined {
  if (!id) return undefined;
  return SESSION_COLORS.find((c) => c.id === id);
}

export interface SessionIcon {
  id: string;
  label: string;
  Icon: LucideIcon;
}

export const SESSION_ICONS: SessionIcon[] = [
  { id: 'briefcase', label: 'Work', Icon: Briefcase },
  { id: 'code', label: 'Code', Icon: Code },
  { id: 'bug', label: 'Bug', Icon: Bug },
  { id: 'file-text', label: 'Document', Icon: FileText },
  { id: 'book-open', label: 'Research', Icon: BookOpen },
  { id: 'pen-line', label: 'Writing', Icon: PenLine },
  { id: 'mail', label: 'Email', Icon: Mail },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'target', label: 'Goal', Icon: Target },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'lightbulb', label: 'Idea', Icon: Lightbulb },
  { id: 'heart', label: 'Personal', Icon: Heart },
  { id: 'star', label: 'Starred', Icon: Star },
  { id: 'flag', label: 'Flagged', Icon: Flag },
  { id: 'sparkles', label: 'AI', Icon: Sparkles },
  { id: 'coffee', label: 'Casual', Icon: Coffee },
  { id: 'globe', label: 'Web', Icon: Globe },
  { id: 'music', label: 'Creative', Icon: Music },
  { id: 'shopping-bag', label: 'Shopping', Icon: ShoppingBag },
  { id: 'wrench', label: 'Tools', Icon: Wrench },
];

export function findSessionIcon(id: string | undefined): SessionIcon | undefined {
  if (!id) return undefined;
  return SESSION_ICONS.find((i) => i.id === id);
}
