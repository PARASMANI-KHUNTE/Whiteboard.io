import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode2,
  FileImage,
  FileJson,
  Grid3x3,
  Loader2,
  Maximize2,
  Moon,
  Scan,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import type { CanvasElement } from '../types';
import { ModalShell } from './ui/ModalShell';
import { renderBoardToSvg } from '../utils/boardSvgExporter';
import {
  canvasToRasterBlob,
  renderBoardToCanvas,
  triggerBlobDownload,
} from '../utils/boardCanvasExporter';
import {
  EXPORT_FORMAT_OPTIONS,
  EXPORT_SCALE_OPTIONS,
  buildBoardJsonExport,
  formatByteSize,
  getExportFormatOption,
  resolveExportBackground,
  sanitizeExportFilename,
  type ExportBackground,
  type ExportFormat,
  type ExportScale,
  type ExportScope,
  type ExportViewportInfo,
} from '../utils/exportTypes';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  elements: Record<string, CanvasElement>;
  roomId: string | null;
  roomName?: string;
  theme: 'light' | 'dark';
  getViewportSnapshot: () => ExportViewportInfo;
  onExportSuccess?: (message: string, variant?: 'success' | 'info' | 'warning') => void;
}

interface PreviewArtifact {
  url: string | null;
  jsonPreview: string | null;
  blob: Blob;
  width: number;
  height: number;
  scale: number;
  wasDownscaled: boolean;
  usedViewportFallback: boolean;
  usedPngFallback: boolean;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  elements,
  roomId,
  roomName,
  theme,
  getViewportSnapshot,
  onExportSuccess,
}) => {
  const elementCount = Object.keys(elements).length;
  const defaultFilenameBase = `whiteboard-${roomId || 'solo'}`;

  const [format, setFormat] = useState<ExportFormat>('png');
  const [scope, setScope] = useState<ExportScope>(elementCount > 0 ? 'board' : 'viewport');
  const [background, setBackground] = useState<ExportBackground>(theme);
  const [includeGrid, setIncludeGrid] = useState<boolean>(true);
  const [scale, setScale] = useState<ExportScale>(2);
  const [filenameInput, setFilenameInput] = useState<string>(defaultFilenameBase);

  const [preview, setPreview] = useState<PreviewArtifact | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<boolean>(false);

  const activeUrlRef = useRef<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpenRef = useRef<boolean>(false);

  // Sync sensible defaults cleanly each time the dialog opens.
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setBackground(theme);
      setScope(Object.keys(elements).length > 0 ? 'board' : 'viewport');
      setFilenameInput(`whiteboard-${roomId || 'solo'}`);
      setRenderError(null);
      setCopiedState(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, theme, roomId, elements]);

  // Revoke any retained Object URL on close or unmount.
  useEffect(() => {
    if (!isOpen && activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
      setPreview(null);
    }
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, []);

  const formatMeta = useMemo(() => getExportFormatOption(format), [format]);
  const effectiveBackground = useMemo(
    () => resolveExportBackground(background, format, theme),
    [background, format, theme]
  );
  const resolvedFilename = useMemo(
    () => sanitizeExportFilename(filenameInput, formatMeta.extension),
    [filenameInput, formatMeta.extension]
  );

  // Build live preview artifact whenever modal is open or export options change.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsRendering(true);
    setRenderError(null);

    const timer = window.setTimeout(async () => {
      try {
        const viewport = getViewportSnapshot();

        if (format === 'json') {
          const jsonText = buildBoardJsonExport({
            roomId,
            roomName,
            theme,
            elements,
          });
          const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
          if (cancelled) return;
          if (activeUrlRef.current) {
            URL.revokeObjectURL(activeUrlRef.current);
            activeUrlRef.current = null;
          }
          setPreview({
            url: null,
            jsonPreview: jsonText,
            blob,
            width: 0,
            height: 0,
            scale: 1,
            wasDownscaled: false,
            usedViewportFallback: false,
            usedPngFallback: false,
          });
          return;
        }

        if (format === 'svg') {
          const { svg, scene } = renderBoardToSvg({
            elements,
            viewport,
            scope,
            background: effectiveBackground,
            appTheme: theme,
            includeGrid,
            roomName,
          });
          const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
          const objectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current);
          activeUrlRef.current = objectUrl;
          setPreview({
            url: objectUrl,
            jsonPreview: null,
            blob,
            width: scene.pixelWidth,
            height: scene.pixelHeight,
            scale: 1,
            wasDownscaled: false,
            usedViewportFallback: scene.usedViewportFallback,
            usedPngFallback: false,
          });
          return;
        }

        const { canvas, scene } = renderBoardToCanvas({
          elements,
          viewport,
          scope,
          background: effectiveBackground,
          appTheme: theme,
          includeGrid,
          scale,
          format,
        });
        const { blob, usedPngFallback } = await canvasToRasterBlob(canvas, format);
        const objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        if (activeUrlRef.current) URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = objectUrl;
        setPreview({
          url: objectUrl,
          jsonPreview: null,
          blob,
          width: scene.pixelWidth,
          height: scene.pixelHeight,
          scale: scene.scale,
          wasDownscaled: scene.wasDownscaled,
          usedViewportFallback: scene.usedViewportFallback,
          usedPngFallback,
        });
      } catch (err) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : 'Could not render export preview.');
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }, 35);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    isOpen,
    format,
    scope,
    effectiveBackground,
    includeGrid,
    scale,
    theme,
    elements,
    roomId,
    roomName,
    getViewportSnapshot,
  ]);

  const handleDownload = () => {
    if (!preview) return;
    const downloadName =
      preview.usedPngFallback && format !== 'png'
        ? sanitizeExportFilename(filenameInput, 'png')
        : resolvedFilename;

    triggerBlobDownload(preview.blob, downloadName);
    if (preview.usedPngFallback) {
      onExportSuccess?.(
        `Browser does not support ${formatMeta.shortLabel} encoding; exported as PNG (${downloadName})`,
        'warning'
      );
    } else {
      onExportSuccess?.(
        `Exported ${formatMeta.shortLabel}: ${downloadName}`,
        'success'
      );
    }
    onClose();
  };

  const canCopyToClipboard =
    Boolean(preview) &&
    (format === 'json' ||
      format === 'svg' ||
      (format === 'png' && typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write)));

  const handleCopy = async () => {
    if (!preview) return;
    try {
      if (format === 'json' && preview.jsonPreview !== null) {
        await navigator.clipboard.writeText(preview.jsonPreview);
      } else if (format === 'svg') {
        const text = await preview.blob.text();
        await navigator.clipboard.writeText(text);
      } else if (format === 'png' && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': preview.blob })]);
      } else {
        return;
      }
      setCopiedState(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedState(false), 2000);
      onExportSuccess?.(`Copied ${formatMeta.shortLabel} to clipboard`, 'success');
    } catch {
      onExportSuccess?.(`Could not copy ${formatMeta.shortLabel} to clipboard`, 'warning');
    }
  };

  const formatIcon = (id: ExportFormat) => {
    if (id === 'svg') return FileCode2;
    if (id === 'json') return FileJson;
    return FileImage;
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      titleId="export-modal-title"
      describedById="export-modal-desc"
      overlayId="export-modal-overlay"
      dialogId="export-modal-dialog"
      overlayClassName="z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/55 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      panelClassName="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 id="export-modal-title" className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Export &amp; Download Whiteboard
            </h2>
            <p id="export-modal-desc" className="text-xs text-slate-500 dark:text-slate-400">
              Preview your export live and choose format, bounds, background, and scale
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close export dialog"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">
        {/* Left: Live Preview Stage */}
        <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col gap-3 bg-slate-50/60 dark:bg-slate-950/50">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-md font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
                {formatMeta.shortLabel}
              </span>
              {preview && formatMeta.isVisual && (
                <span className="px-2 py-0.5 rounded-md font-medium bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300 tabular-nums">
                  {preview.width} × {preview.height} px
                </span>
              )}
              {preview && (
                <span className="px-2 py-0.5 rounded-md font-medium bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300 tabular-nums">
                  {formatByteSize(preview.blob.size)}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400 tabular-nums">
                {elementCount} {elementCount === 1 ? 'element' : 'elements'}
              </span>
            </div>

            {isRendering && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Updating preview…
              </span>
            )}
          </div>

          {/* Preview Canvas Box */}
          <div
            id="export-preview-stage"
            className={`relative flex-1 min-h-[250px] sm:min-h-[320px] rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center p-3 overflow-hidden ${
              format === 'json'
                ? 'bg-slate-900 text-slate-100'
                : effectiveBackground === 'transparent'
                ? 'wb-checkerboard'
                : effectiveBackground === 'dark'
                ? 'bg-slate-950'
                : 'bg-slate-100 dark:bg-slate-900'
            }`}
          >
            {renderError ? (
              <div className="text-center text-xs text-rose-500 px-4">{renderError}</div>
            ) : format === 'json' ? (
              <pre
                id="export-json-preview"
                className="w-full h-full max-h-[380px] overflow-auto text-[11px] leading-relaxed font-mono text-slate-200 p-2 select-text"
              >
                {preview?.jsonPreview ? preview.jsonPreview.slice(0, 12000) : 'Preparing JSON…'}
                {preview?.jsonPreview && preview.jsonPreview.length > 12000
                  ? '\n… (preview truncated; full payload included in download)'
                  : ''}
              </pre>
            ) : preview?.url ? (
              <img
                id="export-preview-image"
                src={preview.url}
                alt={`Whiteboard ${formatMeta.shortLabel} export preview`}
                className="max-w-full max-h-[380px] object-contain rounded-lg shadow-md border border-slate-200/70 dark:border-slate-700/70"
              />
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating preview…
              </div>
            )}
          </div>

          {preview?.usedViewportFallback && formatMeta.isVisual && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Board has no elements yet — previewing empty current viewport.
            </p>
          )}
          {preview?.wasDownscaled && formatMeta.isVisual && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Large board scaled cleanly ({preview.scale.toFixed(2)}x) to stay within browser raster limits.
            </p>
          )}
        </div>

        {/* Right: Export Settings */}
        <div className="lg:col-span-5 p-4 sm:p-5 space-y-5">
          {/* Format Selector */}
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Format
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3 gap-1.5" role="radiogroup" aria-label="Export format">
              {EXPORT_FORMAT_OPTIONS.map((option) => {
                const Icon = formatIcon(option.id);
                const selected = format === option.id;
                return (
                  <button
                    key={option.id}
                    id={`export-format-${option.id}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setFormat(option.id)}
                    className={`flex flex-col items-center justify-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{option.shortLabel}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              {formatMeta.description}
            </p>
          </div>

          {formatMeta.isVisual ? (
            <>
              {/* Scope */}
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Export Area
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="export-scope-board"
                    type="button"
                    aria-pressed={scope === 'board'}
                    onClick={() => setScope('board')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      scope === 'board'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    Entire Board
                  </button>
                  <button
                    id="export-scope-viewport"
                    type="button"
                    aria-pressed={scope === 'viewport'}
                    onClick={() => setScope('viewport')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      scope === 'viewport'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Scan className="w-3.5 h-3.5" />
                    Current View
                  </button>
                </div>
              </div>

              {/* Background */}
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Background
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    id="export-bg-light"
                    type="button"
                    aria-pressed={effectiveBackground === 'light'}
                    onClick={() => setBackground('light')}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      effectiveBackground === 'light'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    Light
                  </button>
                  <button
                    id="export-bg-dark"
                    type="button"
                    aria-pressed={effectiveBackground === 'dark'}
                    onClick={() => setBackground('dark')}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      effectiveBackground === 'dark'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    Dark
                  </button>
                  <button
                    id="export-bg-transparent"
                    type="button"
                    disabled={!formatMeta.supportsTransparency}
                    title={
                      formatMeta.supportsTransparency
                        ? 'Export with transparent background'
                        : 'JPEG does not support transparency'
                    }
                    aria-pressed={effectiveBackground === 'transparent'}
                    onClick={() => setBackground('transparent')}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      effectiveBackground === 'transparent'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
              </div>

              {/* Resolution Scale & Grid */}
              <div className="grid grid-cols-2 gap-3 items-start">
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Scale
                  </span>
                  {formatMeta.supportsScale ? (
                    <div className="grid grid-cols-3 gap-1">
                      {EXPORT_SCALE_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          id={`export-scale-${opt}x`}
                          type="button"
                          aria-pressed={scale === opt}
                          onClick={() => setScale(opt)}
                          className={`py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                            scale === opt
                              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {opt}x
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Vector (∞)
                    </div>
                  )}
                </div>

                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Canvas Grid
                  </span>
                  <button
                    id="export-grid-toggle"
                    type="button"
                    role="switch"
                    aria-checked={includeGrid}
                    onClick={() => setIncludeGrid((prev) => !prev)}
                    className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      includeGrid
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Grid3x3 className="w-3.5 h-3.5" />
                    {includeGrid ? 'Included' : 'Hidden'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              JSON export preserves all strokes, shapes, sticky notes, text, icons, wires, and room metadata for backups or portability.
            </div>
          )}

          {/* Filename */}
          <div>
            <label
              htmlFor="export-filename-input"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2"
            >
              File Name
            </label>
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-500 overflow-hidden">
              <input
                id="export-filename-input"
                type="text"
                value={filenameInput}
                onChange={(e) => setFilenameInput(e.target.value)}
                placeholder="whiteboard"
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
              />
              <span className="px-2.5 py-2 text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                .{formatMeta.extension}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
              Saves as <span className="font-mono text-slate-600 dark:text-slate-300">{resolvedFilename}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 sm:px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
        <div>
          {canCopyToClipboard && (
            <button
              id="export-copy-btn"
              type="button"
              onClick={handleCopy}
              disabled={!preview || isRendering}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {copiedState ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy {formatMeta.shortLabel}
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="export-download-btn"
            type="button"
            disabled={!preview || Boolean(renderError)}
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm shadow-blue-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Download {formatMeta.shortLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
