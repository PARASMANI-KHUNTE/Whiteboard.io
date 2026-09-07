import React, { useState } from 'react';
import { BACKEND_URL } from '../config';
import { CanvasElement } from '../types';
import {
  Sparkles,
  Brain,
  GitFork,
  StickyNote as StickyIcon,
  Layers,
  X,
  Loader2,
  AlertCircle,
  Wand2,
  Lightbulb,
} from 'lucide-react';

interface AiGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertElements: (elements: CanvasElement[], replaceBoard?: boolean) => void;
  canvasCenter: { x: number; y: number };
  authToken?: string | null;
}

type DiagramType = 'mindmap' | 'flowchart' | 'brainstorm' | 'architecture';

interface TemplateOption {
  id: DiagramType;
  label: string;
  icon: React.ReactNode;
  description: string;
  examples: string[];
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'mindmap',
    label: 'Mind Map',
    icon: <Brain className="w-5 h-5 text-indigo-500" />,
    description: 'Central topic radiating into core concepts, branches, and actionable details.',
    examples: [
      'Product Launch Strategy for AI App',
      'Personal Productivity & Habits System',
      'Cybersecurity Zero-Trust Architecture',
    ],
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    icon: <GitFork className="w-5 h-5 text-emerald-500" />,
    description: 'Step-by-step logic with start/end pills, process boxes, decision diamonds, and arrows.',
    examples: [
      'User Authentication & 2FA Flow',
      'E-Commerce Order Fulfillment & Returns',
      'Bug Triage & Hotfix Deployment Pipeline',
    ],
  },
  {
    id: 'brainstorm',
    label: 'Sticky Board',
    icon: <StickyIcon className="w-5 h-5 text-amber-500" />,
    description: 'Categorized sticky notes organized in neat columns (SWOT, Retro, or Kanban).',
    examples: [
      'SWOT Analysis for Electric Vehicle Startup',
      'Sprint Retrospective: What went well, what to improve',
      'Growth Marketing Experiments for Q4',
    ],
  },
  {
    id: 'architecture',
    label: 'Architecture',
    icon: <Layers className="w-5 h-5 text-sky-500" />,
    description: 'High-level cloud topology (Clients, CDN, API Gateway, Microservices, DB).',
    examples: [
      'Real-Time Video Streaming Service Architecture',
      'Event-Driven IoT Telemetry System',
      'Serverless Microservices on AWS with Redis & Mongo',
    ],
  },
];

export const AiGenerateModal: React.FC<AiGenerateModalProps> = ({
  isOpen,
  onClose,
  onInsertElements,
  canvasCenter,
  authToken,
}) => {
  const [selectedType, setSelectedType] = useState<DiagramType>('mindmap');
  const [prompt, setPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceBoard, setReplaceBoard] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentTemplate = TEMPLATES.find((t) => t.id === selectedType) || TEMPLATES[0];

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/ai/generate-diagram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          type: selectedType,
          canvasCenter,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.elements)) {
        throw new Error(data.error || 'Failed to generate diagram from Gemini');
      }

      onInsertElements(data.elements, replaceBoard);
      onClose();
      setPrompt('');
    } catch (err: any) {
      console.error('[AI Diagram Generation Error]:', err);
      setError(err.message || 'Error communicating with the Gemini API server.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-r from-indigo-50/50 via-purple-50/30 to-white dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-slate-900 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Generate with Gemini AI
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Gemini 2.5 Flash
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Turn your thoughts, workflows, or meeting notes into interactive whiteboard diagrams instantly.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Template Selector Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2.5">
              Diagram Style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {TEMPLATES.map((tmpl) => {
                const isSelected = selectedType === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => {
                      setSelectedType(tmpl.id);
                      setError(null);
                    }}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-slate-900 dark:text-white shadow-sm ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-850'
                    }`}
                  >
                    <div className="mb-2 p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700/60">
                      {tmpl.icon}
                    </div>
                    <span className="text-sm font-semibold">{tmpl.label}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-tight">
                      {tmpl.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt Form */}
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Describe your diagram or concept</span>
                <span className="text-[11px] font-normal text-slate-400">Natural language</span>
              </label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setError(null);
                }}
                disabled={isGenerating}
                placeholder={`E.g., ${currentTemplate.examples[0]}`}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400 resize-none shadow-inner"
              />
            </div>

            {/* Quick Suggestions Chips */}
            <div>
              <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span>Try an example prompt:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentTemplate.examples.map((example, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(example);
                      setError(null);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700/80 transition-all text-left truncate max-w-full"
                  >
                    "{example}"
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">{error}</p>
                  {error.includes('GEMINI_API_KEY') && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400">
                      To fix this, add <code className="px-1 py-0.5 bg-rose-100 dark:bg-rose-900/50 rounded font-mono">GEMINI_API_KEY=your_key_here</code> to your <code className="font-mono">server/.env</code> file (or hosting dashboard) and restart the backend.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Insertion Options */}
            <div className="pt-1 flex items-center justify-between">
              <label className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={replaceBoard}
                  onChange={(e) => setReplaceBoard(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700"
                />
                <span>Clear existing board before inserting</span>
              </label>

              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isGenerating}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!prompt.trim() || isGenerating}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-all transform active:scale-95"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Synthesizing Diagram...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      <span>Generate Elements</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
