import { useState, useRef, useCallback, useEffect } from 'react';
import type { AttributionMeta } from '../types';

interface HoverState {
  elementId: string;
  attribution: AttributionMeta;
  x: number;
  y: number;
}

const HOVER_DELAY_MS = 200;

/**
 * Hook that manages the hover-to-reveal attribution tooltip state.
 *
 * Tracks the currently hovered `elementId` so minor pointer movement within
 * the same element does not reset the hover delay timer.
 */
export function useAttributionHover() {
  const [hovered, setHovered] = useState<HoverState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeElementIdRef = useRef<string | null>(null);
  const latestCoordsRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onElementHover = useCallback(
    (
      elementId: string,
      attribution: AttributionMeta | undefined,
      clientX: number,
      clientY: number,
      immediate = false
    ) => {
      if (!attribution) return;
      latestCoordsRef.current = { x: clientX, y: clientY };

      if (activeElementIdRef.current === elementId) {
        // Still over the same element: update position if visible, otherwise let timer fire.
        setHovered((prev) =>
          prev && prev.elementId === elementId
            ? { elementId, attribution, x: clientX, y: clientY }
            : prev
        );
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      activeElementIdRef.current = elementId;
      setHovered(null);

      if (immediate) {
        setHovered({ elementId, attribution, x: clientX, y: clientY });
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (activeElementIdRef.current !== elementId) return;
        setHovered({
          elementId,
          attribution,
          x: latestCoordsRef.current.x,
          y: latestCoordsRef.current.y,
        });
      }, HOVER_DELAY_MS);
    },
    []
  );

  const onElementLeave = useCallback(() => {
    activeElementIdRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHovered(null);
  }, []);

  return {
    hovered,
    onElementMouseEnter: onElementHover,
    onElementMouseLeave: onElementLeave,
  };
}
