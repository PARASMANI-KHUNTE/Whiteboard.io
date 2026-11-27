import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Minus, Search, Spline, X, type LucideIcon } from 'lucide-react';
import type { ShapeType, ToolType, WireStyle } from '../types';
import type { ThemeMode } from '../hooks/useTheme';
import type {
  WhiteboardAction,
  WhiteboardActionRegistry,
  WhiteboardToolAction,
} from '../hooks/useWhiteboardActions';
import { AVAILABLE_ICONS } from '../constants/icons';
import { TOOLBAR_COLORS } from '../constants/palettes';
import { ColorSwatches } from './ui/ColorSwatches';
import { SHAPE_TOOL_OPTIONS, STROKE_SIZE_OPTIONS } from './ui/toolActions';

type IconComponent = LucideIcon;

export interface SidebarProps {
  actions: WhiteboardActionRegistry;
  theme: ThemeMode;
  isVoiceConnected: boolean;
  isSoloMode?: boolean;
  isGuestOrSignedOut?: boolean;
  isOpen: boolean;
  onClose: () => void;
  toggleButtonRef?: RefObject<HTMLButtonElement | null>;
  currentTool: ToolType;
  currentColor: string;
  currentSize: number;
  canWrite: boolean;
  selectedShapeType: ShapeType;
  selectedIconName: string;
  selectedWireStyle: WireStyle;
  onSelectColor: (color: string) => void;
  onSelectSize: (size: number) => void;
  onSelectShape: (shape: ShapeType) => void;
  onSelectIcon: (iconName: string) => void;
  onSelectWireStyle: (style: WireStyle) => void;
}

interface SidebarButtonProps {
  id?: string;
  icon: IconComponent;
  label: string;
  title?: string;
  ariaLabel?: string;
  expanded: boolean;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}

function SidebarButton({
  id,
  icon: Icon,
  label,
  title,
  ariaLabel,
  expanded,
  active = false,
  disabled = false,
  pressed,
  onClick,
}: SidebarButtonProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${
        expanded ? 'justify-start' : 'justify-center px-2'
      } ${
        active
          ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300 ring-1 ring-blue-300/70 dark:ring-blue-800'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
      <span className={`text-sm font-medium truncate ${expanded ? '' : 'sr-only'}`}>{label}</span>
    </button>
  );
}

interface SidebarActionItemProps {
  action: WhiteboardAction | WhiteboardToolAction;
  id?: string;
  expanded: boolean;
  runAction: (fn: () => void, keepMobileOpen?: boolean) => void;
  keepMobileOpen?: boolean;
}

function SidebarActionItem({
  action,
  id,
  expanded,
  runAction,
  keepMobileOpen = false,
}: SidebarActionItemProps) {
  return (
    <SidebarButton
      id={id}
      icon={action.icon}
      label={action.label}
      title={action.title}
      ariaLabel={'ariaLabel' in action ? action.ariaLabel : action.label}
      expanded={expanded}
      active={action.active}
      pressed={'pressed' in action ? action.pressed : action.active}
      disabled={action.disabled}
      onClick={() => runAction(action.handler, keepMobileOpen)}
    />
  );
}

interface SidebarSectionProps {
  title: string;
  expanded: boolean;
  children: ReactNode;
}

function SidebarSection({ title, expanded, children }: SidebarSectionProps) {
  return (
    <div className="border-t border-slate-200/80 dark:border-slate-800 pt-3 first:border-t-0 first:pt-0">
      {expanded ? (
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {title}
        </p>
      ) : (
        <span className="sr-only">{title}</span>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export default function Sidebar({
  actions,
  isVoiceConnected,
  isSoloMode = false,
  isGuestOrSignedOut = false,
  isOpen,
  onClose,
  toggleButtonRef,
  currentTool,
  currentColor,
  currentSize,
  canWrite,
  selectedShapeType,
  selectedIconName,
  selectedWireStyle,
  onSelectColor,
  onSelectSize,
  onSelectShape,
  onSelectIcon,
  onSelectWireStyle,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const previousOpenRef = useRef(isOpen);
  const [iconQuery, setIconQuery] = useState('');

  const filteredIcons = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    const entries = Object.entries(AVAILABLE_ICONS);
    if (!q) return entries;
    return entries.filter(
      ([key, config]) =>
        key.toLowerCase().includes(q) ||
        config.label.toLowerCase().includes(q) ||
        config.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [iconQuery]);

  // Keep closed drawer inert, move focus in when opened, and restore focus to
  // the navbar trigger when collapsed from inside.
  useEffect(() => {
    const el = sidebarRef.current;
    if (el) {
      el.toggleAttribute('inert', !isOpen);
    }

    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = isOpen;
    if (wasOpen === isOpen) return;

    if (isOpen) {
      const firstControl = el?.querySelector<HTMLButtonElement>('nav button:not([disabled])');
      firstControl?.focus();
      return;
    }
    if (el?.contains(document.activeElement)) {
      toggleButtonRef?.current?.focus();
    }
  }, [isOpen, toggleButtonRef]);

  // Shared CSS uses this to dock the canvas and bottom chrome beside the rail.
  useEffect(() => {
    document.documentElement.dataset.sidebarOpen = String(isOpen);
    return () => {
      delete document.documentElement.dataset.sidebarOpen;
    };
  }, [isOpen]);

  // Collapse when leaving desktop so the panel never covers a small canvas.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) onClose();
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const runAction = useCallback(
    (action: () => void, keepMobileOpen = false) => {
      action();
      if (!keepMobileOpen && window.innerWidth < 1024) onClose();
    },
    [onClose]
  );

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 top-14 z-30 bg-slate-900/40 backdrop-blur-[1px] sm:top-16 lg:hidden"
        />
      )}

      <aside
        ref={sidebarRef}
        id="whiteboard-sidebar"
        aria-label="Whiteboard controls"
        aria-hidden={!isOpen || undefined}
        className={`fixed bottom-0 left-0 top-14 z-40 flex w-64 flex-col overflow-hidden border-r border-slate-200 bg-white/95 shadow-xl backdrop-blur-md transition-transform duration-200 ease-out sm:top-16 dark:border-slate-800 dark:bg-slate-900/95 ${
          isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        <div className="flex shrink-0 flex-col justify-center border-b border-slate-200/80 px-3 py-3 dark:border-slate-800">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">Controls</p>
          <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">Everything in one place</p>
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-3" aria-label="Whiteboard tools">
          <SidebarSection title="Tools" expanded={isOpen}>
            {actions.tools.map((toolAction) => {
              const hasInlineOptions =
                toolAction.tool === 'shape' ||
                toolAction.tool === 'icon' ||
                toolAction.tool === 'wire';
              return (
                <div key={toolAction.tool} className="space-y-1.5">
                  <SidebarActionItem
                    id={`sidebar-${toolAction.id}`}
                    action={toolAction}
                    expanded={isOpen}
                    runAction={runAction}
                    keepMobileOpen={hasInlineOptions}
                  />

                  {toolAction.tool === 'shape' && currentTool === 'shape' && canWrite && (
                    <div
                      id="sidebar-shape-picker"
                      className="mx-1 rounded-xl border border-slate-200/80 bg-slate-50/90 p-2 dark:border-slate-800 dark:bg-slate-800/60"
                    >
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Shape Variant
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {SHAPE_TOOL_OPTIONS.map((shapeOpt) => {
                          const ShapeIcon = shapeOpt.icon;
                          const isCurrent = selectedShapeType === shapeOpt.type;
                          return (
                            <button
                              key={shapeOpt.type}
                              type="button"
                              onClick={() => runAction(() => onSelectShape(shapeOpt.type))}
                              title={shapeOpt.label}
                              aria-label={`Shape: ${shapeOpt.label}`}
                              aria-pressed={isCurrent}
                              className={`flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-[10px] font-medium transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300 font-semibold'
                                  : 'border-slate-200/70 bg-white/80 text-slate-600 hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <ShapeIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate max-w-full">{shapeOpt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {toolAction.tool === 'icon' && currentTool === 'icon' && canWrite && (
                    <div
                      id="sidebar-icon-picker"
                      className="mx-1 rounded-xl border border-slate-200/80 bg-slate-50/90 p-2 dark:border-slate-800 dark:bg-slate-800/60 space-y-2"
                    >
                      <div className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={iconQuery}
                          onChange={(e) => setIconQuery(e.target.value)}
                          placeholder="Filter icons..."
                          aria-label="Filter icons and stickers"
                          className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-6 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                        {iconQuery && (
                          <button
                            type="button"
                            onClick={() => setIconQuery('')}
                            aria-label="Clear icon filter"
                            className="absolute right-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {filteredIcons.length === 0 ? (
                        <p className="py-2 text-center text-[11px] text-slate-400">No matching icons</p>
                      ) : (
                        <div className="grid max-h-36 grid-cols-5 gap-1 overflow-y-auto pr-0.5">
                          {filteredIcons.map(([key, config]) => {
                            const IconComp = config.component;
                            const isCurrent = selectedIconName === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => runAction(() => onSelectIcon(key))}
                                title={config.label}
                                aria-label={`Icon: ${config.label}`}
                                aria-pressed={isCurrent}
                                className={`flex items-center justify-center rounded-lg border p-1.5 transition-colors cursor-pointer ${
                                  isCurrent
                                    ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300'
                                    : 'border-slate-200/70 bg-white/80 text-slate-600 hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                              >
                                <IconComp size={16} />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {toolAction.tool === 'wire' && currentTool === 'wire' && canWrite && (
                    <div
                      id="sidebar-wire-picker"
                      className="mx-1 rounded-xl border border-slate-200/80 bg-slate-50/90 p-2 dark:border-slate-800 dark:bg-slate-800/60"
                    >
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Connector Style
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => runAction(() => onSelectWireStyle('curve'))}
                          aria-pressed={selectedWireStyle === 'curve'}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            selectedWireStyle === 'curve'
                              ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300'
                              : 'border-slate-200/70 bg-white/80 text-slate-600 hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Spline className="h-3.5 w-3.5 shrink-0" />
                          <span>Curve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => runAction(() => onSelectWireStyle('line'))}
                          aria-pressed={selectedWireStyle === 'line'}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            selectedWireStyle === 'line'
                              ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300'
                              : 'border-slate-200/70 bg-white/80 text-slate-600 hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Minus className="h-3.5 w-3.5 shrink-0" />
                          <span>Line</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </SidebarSection>

          <SidebarSection title="Style" expanded={isOpen}>
            <div id="sidebar-style-controls" className="space-y-2.5 px-2 py-1">
              <div>
                <p id="sidebar-color-label" className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Color
                </p>
                <ColorSwatches
                  colors={TOOLBAR_COLORS}
                  selectedColor={currentColor}
                  onSelect={onSelectColor}
                  disabled={!canWrite}
                  size="sm"
                  showCustomPicker
                  idPrefix="sidebar-color-"
                  ariaLabelPrefix="Select "
                  ariaLabelSuffix=" color"
                  ariaLabelledBy="sidebar-color-label"
                  className="flex-wrap gap-2"
                />
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Stroke Width
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {STROKE_SIZE_OPTIONS.map((sizeOpt) => {
                    const isSelected = currentSize === sizeOpt.value;
                    return (
                      <button
                        key={sizeOpt.value}
                        id={`sidebar-size-${sizeOpt.value}`}
                        type="button"
                        disabled={!canWrite}
                        onClick={() => onSelectSize(sizeOpt.value)}
                        aria-label={`Stroke width: ${sizeOpt.label}`}
                        aria-pressed={isSelected}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300 font-semibold'
                            : 'border-slate-200/80 bg-white/80 text-slate-600 hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span
                          style={{ width: `${sizeOpt.dotSize}px`, height: `${sizeOpt.dotSize}px` }}
                          className={`rounded-full shrink-0 ${
                            isSelected ? 'bg-blue-600 dark:bg-blue-300' : 'bg-slate-500 dark:bg-slate-400'
                          }`}
                        />
                        <span>{sizeOpt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </SidebarSection>

          <SidebarSection title="Board" expanded={isOpen}>
            {[
              actions.actions.selectAll,
              actions.actions.undo,
              actions.actions.redo,
              actions.actions.exportPng,
              actions.actions.clearBoard,
            ].map((action) => (
              <SidebarActionItem
                key={action.id}
                id={action.id === 'selectAll' ? 'sidebar-select-all' : undefined}
                action={action}
                expanded={isOpen}
                runAction={runAction}
              />
            ))}
          </SidebarSection>

          <SidebarSection title="Collaborate" expanded={isOpen}>
            {[
              actions.actions.rooms,
              isSoloMode ? actions.actions.shareGoLive : actions.actions.share,
              actions.actions.admin,
              actions.actions.aiDiagram,
              actions.actions.aiChat,
              actions.actions.voiceToggle,
              ...(isVoiceConnected ? [actions.actions.voiceMute] : []),
              actions.actions.recordings,
            ].map((action) => (
              <SidebarActionItem
                key={action.id}
                action={action}
                expanded={isOpen}
                runAction={runAction}
              />
            ))}
          </SidebarSection>

          <SidebarSection title="View" expanded={isOpen}>
            {[actions.actions.snapGrid, actions.actions.shortcuts, actions.actions.theme].map((action) => (
              <SidebarActionItem
                key={action.id}
                id={action.id === 'shortcuts' ? 'sidebar-shortcuts' : undefined}
                action={action}
                expanded={isOpen}
                runAction={runAction}
              />
            ))}
          </SidebarSection>

          <SidebarSection title="Account" expanded={isOpen}>
            {[
              actions.actions.account,
              ...(isGuestOrSignedOut ? [actions.actions.auth] : []),
              actions.actions.about,
            ].map((action) => (
              <SidebarActionItem
                key={action.id}
                action={action}
                expanded={isOpen}
                runAction={runAction}
              />
            ))}
          </SidebarSection>
        </nav>
      </aside>
    </>
  );
}
