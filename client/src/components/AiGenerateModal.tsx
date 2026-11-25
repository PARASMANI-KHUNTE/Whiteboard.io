import React, { useState, useRef, useEffect } from 'react';
import type {
  AiDiagramPayload,
  AiEngineConfig,
  DetailLevel,
  DiagramDirection,
  DiagramType,
  GlobalAiContext,
} from '../ai/types';
import { fetchAiEngine, requestDiagram } from '../ai/api';
import { formatAiEngineDisplay } from '../ai/providerLabels';
import type { PreferredAiEngine } from '../utils/aiSessionStorage';
import { ModalShell } from './ui/ModalShell';
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
  ArrowDown,
  ArrowRight,
  ListChecks,
} from 'lucide-react';

interface AiGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (
    payload: AiDiagramPayload,
    options: { origin: { x: number; y: number }; replaceBoard: boolean },
    context: { boardKey: string; prompt?: string }
  ) => void;
  /** Room code (or "solo") captured when generation starts. */
  boardKey: string;
  canvasCenter: { x: number; y: number };
  authToken?: string | null;
  /** Only the host (or a sole participant) may replace the whole board. */
  canClearBoard?: boolean;
  /** Shared live whiteboard & session history visible to Gemini and Ollama. */
  globalContext?: GlobalAiContext;
  /** Live backend AI configuration (used for provider & model switching). */
  engineConfig?: AiEngineConfig | null;
  /** Selected AI engine preference persisted across modal and chat. */
  preferredEngine?: PreferredAiEngine;
  onChangePreferredEngine?: (next: PreferredAiEngine) => void;
}

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
    description: 'Central topic branching into connected concepts and concrete details.',
    examples: [
      'Product Launch Strategy for AI App',
      'Personal Productivity & Habits System',
      'Cybersecurity Zero-Trust Roadmap',
    ],
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    icon: <GitFork className="w-5 h-5 text-emerald-500" />,
    description: 'Start/end, process steps, decision diamonds and labelled branches.',
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
    description: 'Categorized sticky notes with a goal and grouped idea clusters.',
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
    description: 'Layered services, data stores, async workers and data-flow arrows.',
    examples: [
      'Real-Time Video Streaming Service Architecture',
      'Event-Driven IoT Telemetry System',
      'Serverless Microservices on AWS with Redis & Mongo',
    ],
  },
];

const GENERATION_PHASES = [
  { text: 'Designing the graph — nodes, branches and relationships...', icon: Brain },
  { text: 'Adding domain detail, error paths and edge labels...', icon: Cpu },
  { text: 'Computing layout and routing real connectors...', icon: Wand2 },
  { text: 'Finalizing elements and framing the viewport...', icon: Sparkles },
];

export const AiGenerateModal: React.FC<AiGenerateModalProps> = ({
  isOpen,
  onClose,
  onGenerated,
  boardKey,
  canvasCenter,
  authToken,
  canClearBoard = true,
  globalContext,
  engineConfig: propEngineConfig,
  preferredEngine: propPreferredEngine,
  onChangePreferredEngine,
}) => {
  const [selectedType, setSelectedType] = useState<DiagramType>('mindmap');
  const [detail, setDetail] = useState<DetailLevel>('detailed');
  const [direction, setDirection] = useState<DiagramDirection>('vertical');
  const [prompt, setPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [phaseIndex, setPhaseIndex] = useState<number>(0);
  const [loaderProgress, setLoaderProgress] = useState<number>(10);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceBoard, setReplaceBoard] = useState<boolean>(false);
  const [fetchedConfig, setFetchedConfig] = useState<AiEngineConfig | null>(null);
  const [internalEngine, setInternalEngine] = useState<PreferredAiEngine>({ provider: 'auto' });

  const liveConfig = propEngineConfig ?? fetchedConfig;
  const activeEngine = propPreferredEngine ?? internalEngine;
  const updatePreferredEngine = (next: PreferredAiEngine) => {
    setInternalEngine(next);
    onChangePreferredEngine?.(next);
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortControllerRef.current?.abort(), [boardKey]);

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

  // Never carry a destructive "replace board" choice into a room where the
  // user is not allowed to clear it (e.g. after switching rooms).
  useEffect(() => {
    if (!isOpen || !canClearBoard) {
      setReplaceBoard(false);
    }
  }, [isOpen, canClearBoard]);

  // Escape handling is provided by useModalA11y below.

  // Discover live AI engine capabilities (Gemini, Groq, NVIDIA, OpenRouter, DeepSeek, Ollama).
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchAiEngine(controller.signal)
      .then((config) => {
        if (!config || controller.signal.aborted) return;
        setFetchedConfig(config);
      })
      .catch(() => {
        // Keep previously discovered/fallback info when unreachable.
      });
    return () => controller.abort();
  }, [isOpen]);

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

  const currentTemplate = TEMPLATES.find((t) => t.id === selectedType) || TEMPLATES[0];
  const CurrentPhaseIcon = GENERATION_PHASES[phaseIndex]?.icon || Sparkles;

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isGenerating) return;

    setIsGenerating(true);
    setIsReady(false);
    setError(null);

    // Snapshot the originating board before awaiting; props may change if the
    // user switches rooms while the request is in flight (#68).
    const requestBoardKey = boardKey;
    const requestCanvasCenter = canvasCenter;
    const requestReplaceBoard = replaceBoard && canClearBoard;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload = await requestDiagram({
        prompt: trimmedPrompt,
        type: selectedType,
        detail,
        direction,
        canvasCenter: requestCanvasCenter,
        globalContext,
        provider: activeEngine.provider,
        model: activeEngine.model,
        authToken,
        signal: controller.signal,
      });

      setLoaderProgress(100);
      setIsReady(true);
      await new Promise((resolve) => setTimeout(resolve, 380));

      if (controller.signal.aborted) return;

      onGenerated(
        payload,
        { origin: requestCanvasCenter, replaceBoard: requestReplaceBoard },
        { boardKey: requestBoardKey, prompt: trimmedPrompt }
      );
      onClose();
      setPrompt('');
      setIsReady(false);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[AI Diagram Generation Error]:', err);
      setError(err.message || 'Error communicating with the AI server.');
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const availableProviders = liveConfig?.availableProviders ?? [];
  const selectedProviderOption = availableProviders.find((opt) => opt.id === activeEngine.provider);
  const selectedProviderModels = selectedProviderOption?.models ?? [];
  const headerEngineBadge =
    activeEngine.provider === 'auto'
      ? liveConfig?.label
        ? `Auto · ${liveConfig.label}`
        : 'Checking AI engine…'
      : activeEngine.provider === 'fallback'
        ? 'Offline fallback'
        : formatAiEngineDisplay(
            activeEngine.provider,
            activeEngine.model || selectedProviderOption?.model
          );
  const engineIsLocal =
    activeEngine.provider === 'ollama' ||
    (activeEngine.provider === 'auto' && liveConfig?.provider === 'ollama');

  const contextNodesCount = globalContext?.boardSummary?.nodes.length ?? 0;
  const contextTurnsCount = globalContext?.recentTurns?.length ?? 0;
  const hasSessionContext = contextNodesCount > 0 || contextTurnsCount > 0;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleCancel}
      titleId="ai-generate-modal-title"
      portal={false}
      overlayClassName="z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in"
      panelClassName="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
    >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-r from-indigo-50/50 via-purple-50/30 to-white dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-slate-900 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 id="ai-generate-modal-title" className="text-lg font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                Generate with AI
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {headerEngineBadge}
                </span>
                {engineIsLocal ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Local
                  </span>
                ) : (
                  liveConfig?.ollamaFallback &&
                  activeEngine.provider !== 'fallback' && (
                    <span
                      title="If the selected provider fails or rate-limits, requests automatically fail over across backup AI models and local Ollama."
                      className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    >
                      Auto-failover ready
                    </span>
                  )
                )}
                {hasSessionContext && (
                  <span
                    title="Live canvas items and session history are shared with every AI engine."
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                  >
                    Session context: {contextNodesCount} items
                    {contextTurnsCount > 0 ? ` · ${contextTurnsCount} turns` : ''}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isGenerating
                  ? 'Designing a connected, domain-aware diagram...'
                  : 'Describe a system or workflow. You will get real connectors, branches and detail lines — then a chat to refine it.'}
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
            <div className="relative w-32 h-32 mb-7 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/30 to-violet-500/30 animate-ping opacity-50" />
              <div className="absolute inset-2 rounded-full bg-indigo-500/15 dark:bg-indigo-500/25 animate-pulse" />

              <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-indigo-500 border-r-violet-500 border-b-fuchsia-500 animate-spin [animation-duration:1.4s]" />

              <div className="absolute w-3 h-3 rounded-full bg-indigo-400 shadow-lg shadow-indigo-500/80 -top-1 left-1/2 -translate-x-1/2 animate-bounce" />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-500/80 -bottom-1 left-6 animate-pulse" />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-violet-400 shadow-md shadow-violet-500/80 top-8 -right-1.5 animate-pulse" />

              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-fuchsia-600 flex items-center justify-center shadow-xl shadow-indigo-500/40 text-white transform hover:scale-105 transition-transform">
                {isReady ? (
                  <CheckCircle2 className="w-8 h-8 text-white animate-in zoom-in-75 duration-200" />
                ) : (
                  <CurrentPhaseIcon className="w-8 h-8 text-white animate-pulse" />
                )}
              </div>
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
              {isReady ? 'Diagram Ready!' : 'Synthesizing Your Diagram'}
            </h3>

            <div className="h-6 flex items-center justify-center mb-6">
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 animate-in fade-in slide-in-from-bottom-1 duration-200">
                {isReady
                  ? 'Framing the diagram and opening follow-up chat...'
                  : GENERATION_PHASES[phaseIndex].text}
              </p>
            </div>

            <div className="w-full max-w-sm h-3 bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden mb-3 relative border border-slate-200/80 dark:border-slate-700/80 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 rounded-full transition-all duration-300 relative overflow-hidden"
                style={{ width: `${loaderProgress}%` }}
              >
                <div className="absolute inset-0 bg-white/35 animate-[pulse_1.2s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </div>
            </div>

            <div className="flex items-center justify-between w-full max-w-sm text-xs font-semibold text-slate-400 dark:text-slate-500 mb-8 px-1">
              <span>
                {currentTemplate.label} · {detail === 'detailed' ? 'Detailed' : 'Standard'}
              </span>
              <span>{Math.round(loaderProgress)}%</span>
            </div>

            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-200 dark:border-slate-700 shadow-xs active:scale-95"
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
                    Name the system, users and failure cases
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

              {/* AI Provider & Model Switcher */}
              <div className="space-y-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                    <span>AI Provider</span>
                  </div>
                  {selectedProviderModels.length > 0 && (
                    <select
                      id="ai-modal-model-select"
                      aria-label="Select AI model"
                      value={activeEngine.model || ''}
                      onChange={(e) =>
                        updatePreferredEngine({
                          provider: activeEngine.provider,
                          model: e.target.value || undefined,
                        })
                      }
                      className="max-w-[230px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    >
                      <option value="">Default ({selectedProviderOption?.model})</option>
                      {selectedProviderModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Select AI provider">
                  <button
                    id="ai-provider-pill-auto"
                    type="button"
                    onClick={() => updatePreferredEngine({ provider: 'auto' })}
                    aria-pressed={activeEngine.provider === 'auto'}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      activeEngine.provider === 'auto'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Auto
                  </button>

                  {availableProviders.map((opt) => {
                    const isSelected = activeEngine.provider === opt.id;
                    return (
                      <button
                        key={opt.id}
                        id={`ai-provider-pill-${opt.id}`}
                        type="button"
                        disabled={!opt.configured}
                        onClick={() => updatePreferredEngine({ provider: opt.id })}
                        aria-pressed={isSelected}
                        title={
                          opt.configured
                            ? `Use ${opt.label} (${opt.model})`
                            : `${opt.label} has no API key configured in server/.env`
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected
                              ? 'bg-white'
                              : opt.configured
                                ? 'bg-emerald-500'
                                : 'bg-slate-400'
                          }`}
                        />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}

                  <button
                    id="ai-provider-pill-fallback"
                    type="button"
                    onClick={() => updatePreferredEngine({ provider: 'fallback' })}
                    aria-pressed={activeEngine.provider === 'fallback'}
                    title="Use built-in deterministic offline diagram engine (no API calls)"
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      activeEngine.provider === 'fallback'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Offline
                  </button>
                </div>
              </div>

              {/* Detail + Orientation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5 text-indigo-500" />
                    Detail level
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70">
                    {(['standard', 'detailed'] as DetailLevel[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDetail(level)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          detail === level
                            ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                      >
                        {level === 'standard' ? 'Standard' : 'Detailed'}
                        <span className="block text-[10px] font-normal opacity-70">
                          {level === 'standard' ? '8–14 nodes' : '14–26 nodes'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Orientation
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70">
                    <button
                      type="button"
                      onClick={() => setDirection('vertical')}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        direction === 'vertical'
                          ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      Vertical
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection('horizontal')}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        direction === 'horizontal'
                          ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Horizontal
                    </button>
                  </div>
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
                        To fix this, add{' '}
                        <code className="px-1 py-0.5 bg-rose-100 dark:bg-rose-900/50 rounded font-mono">
                          GEMINI_API_KEY=your_key_here
                        </code>{' '}
                        to your <code className="font-mono">server/.env</code> file (or hosting
                        dashboard) and restart the backend.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Insertion Options & Action Buttons */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                {canClearBoard ? (
                  <label className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={replaceBoard}
                      onChange={(e) => setReplaceBoard(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700"
                    />
                    <span>Clear existing board before inserting</span>
                  </label>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Only the room host can clear a shared board.
                  </span>
                )}

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
                    <span>Generate Diagram</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
    </ModalShell>
  );
};
