import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import type { CanvasElement, RemoteUser } from '../../types';
import { computeMinimapScene, minimapPointToWorldPan } from '../../utils/minimapGeometry';

interface CanvasMinimapProps {
  visible: boolean;
  elements: Record<string, CanvasElement>;
  pan: { x: number; y: number };
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Live collaborator state from the shared cursor-moved socket subscription. */
  collaborators?: Record<string, RemoteUser>;
  currentUserId?: string;
  onPanTo: (nextPan: { x: number; y: number }) => void;
  onClose: () => void;
}

const MINIMAP_WIDTH = 176;
const MINIMAP_HEIGHT = 112;

/**
 * Collapsible corner minimap displaying element distribution and the current
 * viewport rectangle. Clicking anywhere pans the camera to that region.
 */
export const CanvasMinimap: React.FC<CanvasMinimapProps> = ({
  visible,
  elements,
  pan,
  zoom,
  viewportWidth,
  viewportHeight,
  collaborators,
  currentUserId,
  onPanTo,
  onClose,
}) => {
  const remoteCollaborators = useMemo(
    () => Object.values(collaborators ?? {}).filter((user) => user.id !== currentUserId),
    [collaborators, currentUserId]
  );

  const scene = useMemo(
    () => computeMinimapScene(
      elements,
      pan,
      zoom,
      viewportWidth,
      viewportHeight,
      MINIMAP_WIDTH,
      MINIMAP_HEIGHT,
      remoteCollaborators
    ),
    [elements, pan, zoom, viewportWidth, viewportHeight, remoteCollaborators]
  );

  if (!visible) return null;

  const handlePointerNavigate = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    onPanTo(minimapPointToWorldPan(localX, localY, scene, viewportWidth, viewportHeight, zoom));
  };

  return (
    <div
      id="canvas-minimap"
      aria-label="Canvas minimap"
      className="hidden sm:flex flex-col fixed bottom-[4.75rem] left-4 wb-sidebar-minimap z-30 wb-surface-glass rounded-2xl p-1.5 shadow-xl select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="flex items-center justify-between px-1.5 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Minimap
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide minimap"
          className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
        >
          <X className="w-3 h-3" aria-hidden />
        </button>
      </div>
      <svg
        width={scene.boxWidth}
        height={scene.boxHeight}
        viewBox={`0 0 ${scene.boxWidth} ${scene.boxHeight}`}
        onClick={handlePointerNavigate}
        className="rounded-xl bg-slate-100/80 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800 cursor-crosshair"
      >
        {scene.elements.map((item) => (
          <rect
            key={item.id}
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            rx={1}
            fill={item.color}
            fillOpacity={0.65}
          />
        ))}
        <rect
          x={scene.viewport.x}
          y={scene.viewport.y}
          width={scene.viewport.width}
          height={scene.viewport.height}
          rx={2}
          fill="#3b82f6"
          fillOpacity={0.14}
          stroke="#3b82f6"
          strokeWidth={1.5}
        />
        {scene.cursors.map((cursor) => (
          <circle
            key={`minimap-cursor-${cursor.id}`}
            data-collaborator-id={cursor.id}
            cx={cursor.x}
            cy={cursor.y}
            r={cursor.isDrawing ? 3.5 : 2.75}
            fill={cursor.color}
            stroke="#ffffff"
            strokeWidth={1.25}
          >
            <title>{cursor.name}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
};
