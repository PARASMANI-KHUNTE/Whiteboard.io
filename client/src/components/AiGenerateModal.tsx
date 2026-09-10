import React, { useState, useRef, useEffect } from 'react';
import { BACKEND_URL } from '../config';
import { CanvasElement } from '../types';
import {
  Sparkles,
  Brain,
  GitFork,
  StickyNote as StickyIcon,
  Layers,
  X,
  AlertCircle,
  Wand2,
  Lightbulb,
  CheckCircle2,
  Cpu,
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

const GENERATION_PHASES = [
  { text: 'Consulting Gemini 2.5 Flash neural models...', icon: Brain },
  { text: 'Synthesizing visual topology & spatial node structure...', icon: Cpu },
  { text: 'Routing smart connectors, colors & responsive layout...', icon: Wand2 },
  { text: 'Finalizing diagram elements & framing viewport...', icon: Sparkles },
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
  const [phaseIndex, setPhaseIndex] = useState<number>(0);
  const [loaderProgress, setLoaderProgress] = useState<number>(10);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceBoard, setReplaceBoard] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Reliable cancel and abort handler
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setIsReady(false);
    setLoaderProgress(10);
    setPhaseIndex(0);
    setError(null);
    onClose();
  };

  // Keyboard Escape listener to close/cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  // Phase & progress animation timer during active generation
  useEffect(() => {
    if (!isGenerating || isReady) {
      return;
    }

    setLoaderProgress(12);
    setPhaseIndex(0);

    const phaseInterval = setInterval(() => {
      setPhaseIndex((prev) => (prev + 1) % GENERATION_PHASES.length);
    }, 1400);

    const progressInterval = setInterval(() => {
      setLoaderProgress((prev) => {
        if (prev >= 92) return 92;
        const diff = 92 - prev;
        const step = Math.max(0.6, diff * 0.08);
        return Math.min(92, Number((prev + step).toFixed(1)));
      });
    }, 100);

    return () => {
      clearInterval(phaseInterval);
      clearInterval(progressInterval);
    };
  }, [isGenerating, isReady]);

  if (!isOpen) return null;

  const currentTemplate = TEMPLATES.find((t) => t.id === selectedType) || TEMPLATES[0];

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setIsReady(false);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

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
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.elements)) {
        throw new Error(data.error || 'Failed to generate diagram from Gemini');
      }

      // Show completion stage
      setLoaderProgress(100);
      setIsReady(true);
      await new Promise((resolve) => setTimeout(resolve, 380));

      onInsertElements(data.elements, replaceBoard);
      onClose();
      setPrompt('');
      setIsReady(false);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      console.error('[AI Diagram Generation Error]:', err);
      setError(err.message || 'Error communicating with the Gemini API server.');
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const CurrentPhaseIcon = GENERATION_PHASES[phaseIndex]?.icon || Sparkles;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancel();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in"
    >
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
                {isGenerating
                  ? 'Crafting visual diagram elements and preparing camera glide...'
                  : 'Turn your thoughts, workflows, or meeting notes into interactive whiteboard diagrams instantly.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            title="Close / Cancel (Esc)"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CUSTOM ANIMATED LOADER VIEW */}
        {isGenerating ? (
          <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-200">
            {/* Animated AI Core Pulse Visual */}
            <div className="relative w-32 h-32 mb-7 flex items-center justify-center">
              {/* Outer pulsing neon ripple */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/30 to-violet-500/30 animate-ping opacity-50" />
              <div className="absolute inset-2 rounded-full bg-indigo-500/15 dark:bg-indigo-500/25 animate-pulse" />

              {/* High-tech spinning gradient ring */}
              <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-indigo-500 border-r-violet-500 border-b-fuchsia-500 animate-spin [animation-duration:1.4s]" />

              {/* Orbiting particles */}
              <div className="absolute w-3 h-3 rounded-full bg-indigo-400 shadow-lg shadow-indigo-500/80 -top-1 left-1/2 -translate-x-1/2 animate-bounce" />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-500/80 -bottom-1 left-6 animate-pulse" />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-violet-400 shadow-md shadow-violet-500/80 top-8 -right-1.5 animate-pulse" />

              {/* Central Hex/Rounded Badge */}
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-fuchsia-600 flex items-center justify-center shadow-xl shadow-indigo-500/40 text-white transform hover:scale-105 transition-transform">
                {isReady ? (
                  <CheckCircle2 className="w-8 h-8 text-white animate-in zoom-in-75 duration-200" />
                ) : (
                  <CurrentPhaseIcon className="w-8 h-8 text-white animate-pulse" />
                )}
              </div>
            </div>

            {/* Stage Title */}
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
              {isReady ? 'Diagram Ready!' : 'Synthesizing Your Diagram'}
            </h3>

            {/* Dynamic Status Ticker */}
            <div className="h-6 flex items-center justify-center mb-6">
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 animate-in fade-in slide-in-from-bottom-1 duration-200">
                {isReady
                  ? 'Navigating to your new diagram on the canvas...'
                  : GENERATION_PHASES[phaseIndex].text}
              </p>
            </div>

            {/* Shimmering Dynamic Progress Bar */}
            <div className="w-full max-w-sm h-3 bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden mb-3 relative border border-slate-200/80 dark:border-slate-700/80 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 rounded-full transition-all duration-300 relative overflow-hidden"
                style={{ width: `${loaderProgress}%` }}
              >
                <div className="absolute inset-0 bg-white/35 animate-[pulse_1.2s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </div>
            </div>

            <div className="flex items-center justify-between w-full max-w-sm text-xs font-semibold text-slate-400 dark:text-slate-500 mb-8 px-1">
              <span>{currentTemplate.label} Topology</span>
              <span>{Math.round(loaderProgress)}%</span>
            </div>

            {/* Cancel Button */}
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 transition-all cursor-pointer border border-slate-200 dark:border-slate-700 shadow-xs active:scale-95"
            >
              Cancel Generation
            </button>
          </div>
        ) : (
          /* STANDARD FORM VIEW */
          <div className="p-6 overflow-y-auto space-y-6">
            {/* Template Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Choose Diagram Architecture
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {TEMPLATES.map((tpl) => {
                  const isSelected = selectedType === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedType(tpl.id)}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        {tpl.icon}
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white">
                          {tpl.label}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-tight">
                          {tpl.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prompt Input Form */}
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="ai-prompt-input"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between"
                >
                  <span>Describe Your Diagram</span>
                  <span className="text-[11px] font-normal lowercase text-slate-400">
                    Be specific for best visual results
                  </span>
                </label>
                <textarea
                  id="ai-prompt-input"
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={`e.g., "${currentTemplate.examples[0]}"`}
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-sm resize-none transition-all shadow-inner"
                  autoFocus
                />
              </div>

              {/* Prompt Suggestions */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  <span>Try an example for {currentTemplate.label}:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentTemplate.examples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setPrompt(example);
                        setError(null);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700/80 transition-all text-left truncate max-w-full cursor-pointer"
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

              {/* Insertion Options & Action Buttons */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
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
                    onClick={handleCancel}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!prompt.trim() || isGenerating}
                    className="px-5 py-2.5 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-all transform active:scale-95 cursor-pointer"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>Generate Elements</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
