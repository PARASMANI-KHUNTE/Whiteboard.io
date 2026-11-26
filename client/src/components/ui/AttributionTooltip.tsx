import React from 'react';
import type { AttributionMeta } from '../../types';
import { relativeTime, shortTime } from '../../utils/attributionColor';

interface Props {
  attribution: AttributionMeta;
  x: number; // px from left of viewport
  y: number; // px from top of viewport
}

/**
 * Floating attribution tooltip shown when hovering a canvas element.
 * Positioned relative to the viewport using fixed positioning and clamped
 * so it stays inside the viewport near screen edges.
 */
export function AttributionTooltip({ attribution, x, y }: Props) {
  const isSamePerson =
    attribution.createdBy === attribution.lastModifiedBy &&
    Math.abs(attribution.lastModifiedAt - attribution.createdAt) < 1000;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  const left = Math.min(Math.max(8, x + 14), Math.max(8, vw - 256));
  const top = Math.min(Math.max(8, y - 8), Math.max(8, vh - 140));

  const avatarStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: color,
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    flexShrink: 0,
    marginRight: 6,
  });

  const initials = (name: string) =>
    (name || '?')
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        background: 'rgba(15,23,42,0.96)',
        color: '#f1f5f9',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        border: '1px solid rgba(99,102,241,0.3)',
        maxWidth: 240,
        pointerEvents: 'none',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Created by row */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: isSamePerson ? 0 : 6 }}>
        <span style={avatarStyle(attribution.createdByColor)}>
          {initials(attribution.createdByName)}
        </span>
        <div>
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 1 }}>✏️ Created by</div>
          <div style={{ fontWeight: 600, color: attribution.createdByColor }}>
            {attribution.createdByName}
          </div>
          <div style={{ color: '#64748b', fontSize: 10 }}>
            {relativeTime(attribution.createdAt)} · {shortTime(attribution.createdAt)}
          </div>
        </div>
      </div>

      {/* Last modified row — shown when another user edited or the same user updated later */}
      {!isSamePerson && (
        <>
          <div style={{ height: 1, background: 'rgba(99,102,241,0.2)', margin: '6px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={avatarStyle(attribution.lastModifiedByColor)}>
              {initials(attribution.lastModifiedByName)}
            </span>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 1 }}>🔄 Last edited by</div>
              <div style={{ fontWeight: 600, color: attribution.lastModifiedByColor }}>
                {attribution.lastModifiedByName}
              </div>
              <div style={{ color: '#64748b', fontSize: 10 }}>
                {relativeTime(attribution.lastModifiedAt)} · {shortTime(attribution.lastModifiedAt)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
