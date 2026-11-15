import React, { useEffect, useRef, useState } from 'react';
import type {
  AiChatMessage,
  AiChatTurn,
  AiDiagramPayload,
  AiSessionState,
  DiagramDirection,
} from '../ai/types';
import { DIAGRAM_TYPE_LABELS } from '../ai/types';
import { requestRevision } from '../ai/api';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Wand2,
  ArrowDown,
  ArrowRight,
  ListChecks,
  ShieldCheck,
  Plus,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Check,
} from 'lucide-react';

interface AiChatPanelProps {
  isOpen: boolean;
  session: AiSessionState | null;
  onClose: () => void;
  onNewDiagram: () => void;
  onApplyTurn: (payload: AiDiagramPayload, instruction: string) => void;
  authToken?: string | null;
}

interface QuickAction {
  label: string;
  instruction: string;
  direction?: DiagramDirection;
  icon: React.ReactNode;
}

function quickActionsFor(session: AiSessionState): QuickAction[] {
  const actions: QuickAction[] = [];

  if (session.type === 'flowchart') {
    actions.push({
      label: 'Add decision',
      instruction:
        'Add one realistic edge-case decision with two clearly labelled branches, and route both branches to a terminal node.',
      icon: <ListChecks className="w-3.5 h-3.5" />,
    });
  } else if (session.type === 'architecture') {
    actions.push({
      label: 'Add cache + queue',
      instruction:
        'Add a cache layer and an asynchronous queue/worker to the architecture, including labelled data-flow edges.',
      icon: <RefreshCw className="w-3.5 h-3.5" />,
    });
  } else if (session.type === 'mindmap') {
    actions.push({
      label: 'Add a branch',
      instruction:
        'Add one new meaningful branch with two concrete leaves, connected to the central topic.',
      icon: <Plus className="w-3.5 h-3.5" />,
    });
  } else {
    actions.push({
      label: 'Add risks',
      instruction:
        'Add a "Risks" category with three specific, distinct sticky notes, and connect the category to the goal.',
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    });
  }

  actions.push({
    label: 'Label connectors',
    instruction:
      'Label every connector with the condition, status code or data that flows through it. Do not leave branch edges unlabelled.',
    icon: <ListChecks className="w-3.5 h-3.5" />,
  });
  actions.push({
    label: 'Failure paths',
    instruction:
      'Add realistic failure, timeout and retry paths with labelled edges, and terminate every failure branch.',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  });
  actions.push({
    label: 'More detail',
    instruction:
      'Add one concrete detail line to every node: endpoint, payload field, datastore, status code, timeout or limit.',
    icon: <Sparkles className="w-3.5 h-3.5" />,
  });
  actions.push({
    label: 'Simplify',
    instruction:
      'Simplify the diagram to the essential path. Remove secondary nodes but keep the remaining graph fully connected.',
    icon: <Wand2 className="w-3.5 h-3.5" />,
  });

  if (session.direction === 'vertical') {
    actions.push({
      label: 'Horizontal',
      instruction: 'Re-layout the same diagram horizontally, left to right. Keep the content identical.',
      direction: 'horizontal',
      icon: <ArrowRight className="w-3.5 h-3.5" />,
    });
  } else {
    actions.push({
      label: 'Vertical',
      instruction: 'Re-layout the same diagram vertically, top to bottom. Keep the content identical.',
      direction: 'vertical',
      icon: <ArrowDown className="w-3.5 h-3.5" />,
    });
  }

  return actions.slice(0, 7);
}

function toApiHistory(messages: AiChatMessage[]): AiChatTurn[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  isOpen,
  session,
  onClose,
  onNewDiagram,
  onApplyTurn,
  authToken,
}) => {
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const node = scrollRef.current;
    if (node) {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    }
  }, [isOpen, session?.messages.length, isBusy]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      const timer = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(timer);
    }
  }, [isOpen, session?.sessionId]);

  if (!isOpen) return null;

  const send = async (instruction: string, directionOverride?: DiagramDirection) => {
    if (!session) return;
    const trimmed = instruction.trim();
    if (!trimmed || isBusy) return;

    setIsBusy(true);
    setPendingInstruction(trimmed);
    setError(null);

    try {
      const payload = await requestRevision({
        instruction: trimmed,
        graph: session.graph,
        history: toApiHistory(session.messages),
        type: session.type,
        detail: session.detail,
        direction: directionOverride ?? session.direction,
        canvasCenter: session.origin,
        sessionId: session.sessionId,
        authToken,
      });

      onApplyTurn(payload, trimmed);
      setInput('');
    } catch (err: any) {
      console.error('[AI Revision Error]:', err);
      setError(err.message || 'Could not update the diagram. Please try again.');
    } finally {
      setIsBusy(false);
      setPendingInstruction(null);
    }
  };

  const handleSubmit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    void send(input);
  };

  const quickActions = session ? quickActionsFor(session) : [];

  return (
    <div className="fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-4 sm:w-[408px]">
      <div className="flex flex-col h-[64vh] max-h-[64vh] sm:h-full sm:max-h-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50/70 via-violet-50/40 to-white dark:from-indigo-950/30 dark:via-violet-950/15 dark:to-slate-900">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-2 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl text-white shadow-md shadow-indigo-500/20 shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {session?.title || 'AI chat'}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {session ? (
                    <>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                        {DIAGRAM_TYPE_LABELS[session.type]}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {session.detail}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {session.direction}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Current session
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onNewDiagram}
                title="Generate a new diagram"
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-white/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Minimize AI chat"
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/40 dark:bg-slate-950/30">
          {!session && (
            <div className="flex min-h-[240px] h-full flex-col items-center justify-center text-center px-4">
              <div className="p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/20">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h4 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                No AI diagram in this session yet
              </h4>
              <p className="mt-1 max-w-[260px] text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Generate a diagram to start a conversation. This chat is scoped to the current
                board and clears when you switch sessions.
              </p>
              <button
                type="button"
                onClick={onNewDiagram}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 hover:from-indigo-500 hover:to-violet-500 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Generate a diagram
              </button>
            </div>
          )}

          {(session?.messages ?? []).map((message) => (
            <div key={message.id}>
              {message.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-br-md bg-indigo-600 text-white px-3.5 py-2 text-xs leading-relaxed shadow-sm">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="rounded-2xl rounded-tl-md bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3.5 py-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200 shadow-sm whitespace-pre-wrap">
                      {message.content}
                    </div>

                    {message.notice && (
                      <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{message.notice}</span>
                      </div>
                    )}

                    {message.changes && message.changes.length > 0 && (
                      <ul className="space-y-1 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50 px-3 py-2">
                        {message.changes.map((change, index) => (
                          <li
                            key={`${message.id}-change-${index}`}
                            className="flex items-start gap-1.5 text-[11px] text-emerald-800 dark:text-emerald-200"
                          >
                            <Check className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {message.suggestions && message.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {message.suggestions.map((suggestion) => (
                          <button
                            key={`${message.id}-suggestion-${suggestion}`}
                            type="button"
                            disabled={isBusy}
                            onClick={() => void send(suggestion)}
                            className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {isBusy && pendingInstruction && (
            <div className="flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-br-md bg-indigo-600 text-white px-3.5 py-2 text-xs leading-relaxed shadow-sm opacity-80">
                {pendingInstruction}
              </div>
            </div>
          )}

          {isBusy && (
            <div className="flex items-start gap-2">
              <div className="mt-0.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="rounded-2xl rounded-tl-md bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3.5 py-2 text-xs text-slate-500 dark:text-slate-400 shadow-sm">
                Updating the diagram and re-routing connectors...
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Quick actions & composer (only when a session exists) */}
        {session && (
          <div className="px-3 pt-2.5 pb-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void send(action.instruction, action.direction)}
                  className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 border border-slate-200/80 dark:border-slate-700/80 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>

            {/* Composer */}
            <form onSubmit={handleSubmit} className="mt-2 flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                maxLength={800}
                placeholder="Tell the AI what to change… e.g. add a retry path after the payment step"
                className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
              />
              <button
                type="submit"
                disabled={!input.trim() || isBusy}
                title="Send instruction (Enter)"
                className="p-2.5 rounded-xl text-white bg-gradient-to-tr from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>

            <p className="mt-1.5 mb-0.5 text-[10px] text-slate-400 dark:text-slate-500 text-center">
              Changes apply instantly · Ctrl+Z undoes one AI turn
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
