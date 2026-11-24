import React from 'react';
import { Palette } from 'lucide-react';
import type { ColorOption } from '../../constants/palettes';
import { ColorSwatches, type SwatchSize } from './ColorSwatches';

export interface ItemPalettePopoverProps {
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  colors: ColorOption[];
  selectedColor: string;
  onSelectColor: (hex: string) => void;
  triggerId?: string;
  ariaLabel?: string;
  title?: string;
  swatchSize?: SwatchSize;
  idPrefix?: string;
  ariaLabelSuffix?: string;
  popoverPosition?: 'top' | 'bottom';
  triggerVariant?: 'palette' | 'dot' | 'palette-with-dot';
  dotColor?: string;
  stopMouseDown?: boolean;
}

/**
 * Shared floating palette trigger button and swatch popover used inside
 * canvas item action bars (Shape, Icon, Text, and Wire items).
 */
export const ItemPalettePopover: React.FC<ItemPalettePopoverProps> = ({
  isOpen,
  onToggle,
  colors,
  selectedColor,
  onSelectColor,
  triggerId,
  ariaLabel = 'Change color',
  title = 'Change color',
  swatchSize = 'md',
  idPrefix,
  ariaLabelSuffix = ' color',
  popoverPosition = 'bottom',
  triggerVariant = 'palette',
  dotColor = selectedColor,
  stopMouseDown = false,
}) => {
  const positionClass =
    popoverPosition === 'top'
      ? 'bottom-full mb-2 animate-in fade-in zoom-in-95 duration-100'
      : 'top-8';

  return (
    <div className="relative">
      <button
        id={triggerId}
        type="button"
        data-popover-trigger
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={onToggle}
        title={title}
        className={`p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
          triggerVariant === 'palette-with-dot'
            ? `gap-1.5 border ${
                isOpen
                  ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'
              }`
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        {triggerVariant === 'dot' ? (
          <div
            className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shadow-xs"
            style={{ backgroundColor: dotColor }}
          />
        ) : (
          <>
            <Palette className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            {triggerVariant === 'palette-with-dot' && (
              <span
                className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0 shadow-2xs"
                style={{ backgroundColor: dotColor }}
              />
            )}
          </>
        )}
      </button>

      {isOpen && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={`absolute left-1/2 -translate-x-1/2 ${positionClass} bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50`}
        >
          <ColorSwatches
            colors={colors}
            selectedColor={selectedColor}
            onSelect={onSelectColor}
            size={swatchSize}
            idPrefix={idPrefix}
            ariaLabelSuffix={ariaLabelSuffix}
            stopMouseDown={stopMouseDown}
            className={swatchSize === 'md' ? 'gap-1' : ''}
          />
        </div>
      )}
    </div>
  );
};
