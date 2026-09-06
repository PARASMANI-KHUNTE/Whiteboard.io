import React from 'react';
import {
  Heart,
  Star,
  Sparkles,
  Flame,
  Lightbulb,
  User,
  Cloud,
  Database,
  Code,
  Shield,
  MessageSquare,
  ThumbsUp,
  AlertCircle,
  Rocket,
  Smile,
  Compass,
  CheckCircle2,
} from 'lucide-react';

export interface IconConfig {
  label: string;
  component: React.FC<{ className?: string; size?: number; color?: string }>;
}

export const AVAILABLE_ICONS: Record<string, IconConfig> = {
  star: { label: 'Star', component: Star },
  heart: { label: 'Heart', component: Heart },
  sparkles: { label: 'Sparkles', component: Sparkles },
  flame: { label: 'Flame', component: Flame },
  lightbulb: { label: 'Idea', component: Lightbulb },
  user: { label: 'User', component: User },
  cloud: { label: 'Cloud', component: Cloud },
  database: { label: 'Database', component: Database },
  code: { label: 'Code', component: Code },
  shield: { label: 'Shield', component: Shield },
  message: { label: 'Chat', component: MessageSquare },
  'thumbs-up': { label: 'Like', component: ThumbsUp },
  alert: { label: 'Warning', component: AlertCircle },
  rocket: { label: 'Rocket', component: Rocket },
  smile: { label: 'Smile', component: Smile },
  compass: { label: 'Explore', component: Compass },
  check: { label: 'Done', component: CheckCircle2 },
};
