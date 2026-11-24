import { MessageSquare, Sparkles, X, type LucideIcon } from 'lucide-react';

export interface AiActionMeta {
  label: string;
  compactLabel: string;
  ariaLabel: string;
  title: string;
  Icon: LucideIcon;
}

export interface AiDiagramActionMeta extends AiActionMeta {
  disabled: boolean;
}

/**
 * Shared display labels, icons, and accessibility metadata for opening the AI diagram generator.
 */
export function getAiDiagramActionMeta(canWrite = true): AiDiagramActionMeta {
  return {
    label: 'Generate AI diagram',
    compactLabel: 'AI Diagram',
    ariaLabel: 'Generate AI diagram',
    title: 'Generate Mindmaps, Flowcharts & Sticky Boards with Gemini AI',
    Icon: Sparkles,
    disabled: !canWrite,
  };
}

/**
 * Shared display labels, icons, and accessibility metadata for toggling or reopening AI chat.
 */
export function getAiChatActionMeta(isAiChatOpen: boolean): AiActionMeta {
  if (isAiChatOpen) {
    return {
      label: 'Minimize AI chat',
      compactLabel: 'AI Chat',
      ariaLabel: 'Minimize AI chat',
      title: 'Minimize AI chat',
      Icon: MessageSquare,
    };
  }
  return {
    label: 'Open AI chat',
    compactLabel: 'AI Chat',
    ariaLabel: 'Open AI chat',
    title: 'Open AI chat',
    Icon: MessageSquare,
  };
}

/** Metadata for dismissing/minimizing the docked AI chat sheet from its header button. */
export const AI_CHAT_CLOSE_META: AiActionMeta = {
  label: 'Minimize AI chat',
  compactLabel: 'Close',
  ariaLabel: 'Minimize AI chat',
  title: 'Minimize AI chat',
  Icon: X,
};
