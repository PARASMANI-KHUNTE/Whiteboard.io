import React from 'react';
import {
  X,
  Sparkles,
  Radio,
  Vote,
  Shield,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Layers,
  Heart,
} from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAiModal?: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  onOpenAiModal,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/25">
              W
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                About Whiteboard<span className="text-blue-600 dark:text-blue-400">.io</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  v2.0
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The zero-latency, AI-augmented collaborative whiteboard
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-6 text-sm">
          {/* Mission Pitch */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200/60 dark:border-blue-800/40">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
              💡 What is Whiteboard.io?
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Whiteboard.io is an all-in-one real-time visual collaboration workspace designed for distributed teams, designers, tutors, and developers. It merges <strong>instant sketching</strong>, <strong>built-in spatial voice chat</strong>, and <strong>Google Gemini AI diagram generation</strong> into an open, frictionless platform with zero setup or paywalls.
            </p>
          </div>

          {/* Key Differentiators */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-3 uppercase tracking-wider text-xs text-slate-400">
              Why It's Different From Other Alternatives
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Feature 1 */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 font-bold text-xs">
                  <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-950/60">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span>Native Gemini AI Diagrams</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal">
                  Turn plain English into mind maps, flowcharts, and architecture diagrams with a 5-layer rate-limit shield and procedural fallback that never drops a request.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60">
                    <Radio className="w-4 h-4" />
                  </div>
                  <span>Built-in WebRTC Voice Chat</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal">
                  No need for external Zoom or Discord links. Talk directly through the canvas with live audio waveform visualizers and animated speaking halos.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
                  <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60">
                    <Vote className="w-4 h-4" />
                  </div>
                  <span>Consensus Vote-to-Clear</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal">
                  Accidental or malicious board wipes are prevented by a democratic 15-second consensus countdown voting modal across all participants.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                  <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60">
                    <Shield className="w-4 h-4" />
                  </div>
                  <span>Room Governance & Privacy</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal">
                  Host administration with room locks, per-participant drawing permission toggles, user kick governance, and 100% self-hostable MongoDB storage.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Comparison Table */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-slate-400 mb-2.5">
              At-a-Glance Comparison
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3">Feature</th>
                    <th className="py-2.5 px-3 text-blue-600 dark:text-blue-400">Whiteboard.io</th>
                    <th className="py-2.5 px-3 text-slate-500">Miro / FigJam</th>
                    <th className="py-2.5 px-3 text-slate-500">Excalidraw</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="py-2 px-3 font-medium">Built-in Voice Chat</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Free WebRTC
                    </td>
                    <td className="py-2 px-3 text-slate-500">💰 Paid Tier Only</td>
                    <td className="py-2 px-3 text-rose-500 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 shrink-0" /> No
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium">AI Diagram Generation</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Gemini + Shield
                    </td>
                    <td className="py-2 px-3 text-slate-500">💰 Paid Credits</td>
                    <td className="py-2 px-3 text-slate-500">⚠️ Plugin only</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium">Vote-to-Clear Protection</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Democratic Vote
                    </td>
                    <td className="py-2 px-3 text-rose-500 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 shrink-0" /> No
                    </td>
                    <td className="py-2 px-3 text-rose-500 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 shrink-0" /> No
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium">Self-Hostable (Open Source)</td>
                    <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> 100% MIT
                    </td>
                    <td className="py-2 px-3 text-rose-500 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 shrink-0" /> Closed SaaS
                    </td>
                    <td className="py-2 px-3 text-amber-500">⚠️ Client only</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>Crafted with</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 inline" />
            <span>for frictionless collaboration</span>
          </div>
          <div className="flex items-center gap-2">
            {onOpenAiModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAiModal();
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-md shadow-violet-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Try AI Diagram</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
