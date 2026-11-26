import { useState, useCallback, useMemo } from 'react';
import type { CanvasElement, RemoteUser } from '../types';
import type { BlameLegendUser } from '../components/ui/BlameModeLegend';
import { attributionColorForUser, getEffectiveAttribution } from '../utils/attributionColor';

/**
 * Hook that manages blame-mode state.
 *
 * Returns:
 *  - `blameMode`       whether blame mode is currently active
 *  - `toggleBlameMode` toggle handler (wire to toolbar button)
 *  - `legendUsers`     sorted list of users to show in the blame legend
 *  - `blameColorFor`   function that maps an element to its blame overlay colour
 */
export function useBlameMode(
  elements: Record<string, CanvasElement>,
  users?: Record<string, RemoteUser>
) {
  const [blameMode, setBlameMode] = useState(false);

  const toggleBlameMode = useCallback(() => setBlameMode((v) => !v), []);

  /** Aggregate unique creators across all elements when blame mode is active. */
  const legendUsers = useMemo<BlameLegendUser[]>(() => {
    if (!blameMode) return [];
    const map = new Map<string, BlameLegendUser>();
    for (const el of Object.values(elements)) {
      const attr = getEffectiveAttribution(el, users);
      const existing = map.get(attr.createdBy);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(attr.createdBy, {
          id: attr.createdBy,
          name: attr.createdByName,
          color: attributionColorForUser(attr.createdBy, attr.createdByColor),
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [blameMode, elements, users]);

  /**
   * Returns the blame colour for an element when blame mode is on, or null
   * when blame mode is off.
   */
  const blameColorFor = useCallback(
    (el: CanvasElement): string | null => {
      if (!blameMode) return null;
      const attr = getEffectiveAttribution(el, users);
      return attributionColorForUser(attr.createdBy, attr.createdByColor);
    },
    [blameMode, users]
  );

  return { blameMode, toggleBlameMode, legendUsers, blameColorFor };
}
