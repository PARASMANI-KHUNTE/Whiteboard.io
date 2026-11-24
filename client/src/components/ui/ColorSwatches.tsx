import React from 'react';
import { Palette } from 'lucide-react';
import type { ColorOption } from '../../constants/palettes';

export type SwatchSize = 'xs' | 'sm' | 'md';
export type SwatchRingTone = 'blue' | 'slate';

export interface ColorSwatchesProps {
  colors: ColorOption[];
  selectedColor: string;
  onSelect: (hex: string) => void;
  disabled?: boolean;
  size?: SwatchSize;
  ringTone?: SwatchRingTone;
  showCustomPicker?: boolean;
  idPrefix?: string;
  ariaLabelPrefix?: string;
  ariaLabelSuffix?: string;
  ariaLabelledBy?: string;
  stopMouseDown?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<SwatchSize, string> = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6 sm:w-6.5 sm:h-6.5',
  md: 'w-7 h-7',
};

const RING_CLASSES: Record<SwatchRingTone, { selected: string; unselected: string }> = {
  blue: {
    selected: 'ring-2 ring-blue-500 scale-110 shadow-xs opacity-100',
    unselected: 'opacity-85 hover:opacity-100 hover:scale-105',
  },
  slate: {
    selected: 'ring-2 ring-offset-2 ring-slate-800 dark:ring-white scale-110 opacity-100',
    unselected: 'opacity-85 hover:opacity-100 hover:scale-105',
  },
};

/**
 * Shared circular color swatch selector supporting custom color input,
 * keyboard accessibility, and consistent selected/hover ring states.
 */
export const ColorSwatches: React.FC<ColorSwatchesProps> = ({
  colors,
  selectedColor,
  onSelect,
  disabled = false,
  size = 'sm',
  ringTone = 'blue',
  showCustomPicker = false,
  idPrefix,
  ariaLabelPrefix = 'Use ',
  ariaLabelSuffix = ' color',
  ariaLabelledBy,
  stopMouseDown = false,
  className = '',
}) => {
  const sizeClass = SIZE_CLASSES[size];
  const ringClass = RING_CLASSES[ringTone];
  const normalizedSelected = selectedColor.toLowerCase();

  return (
    <div
      role="group"
      aria-labelledby={ariaLabelledBy}
      className={`flex items-center gap-1.5 ${className}`.trim()}
    >
      {colors.map((c) => {
        const isSelected = normalizedSelected === c.hex.toLowerCase();
        const label = c.label || c.hex;
        const swatchId = idPrefix ? `${idPrefix}${c.hex.replace('#', '')}` : undefined;

        return (
          <button
            key={c.hex}
            id={swatchId}
            type="button"
            disabled={disabled}
            aria-label={`${ariaLabelPrefix}${label}${ariaLabelSuffix}`}
            aria-pressed={isSelected}
            title={label}
            style={{ backgroundColor: c.hex }}
            onMouseDown={
              stopMouseDown
                ? (e) => {
                    e.stopPropagation();
                    if (!disabled) onSelect(c.hex);
                  }
                : undefined
            }
            onClick={(e) => {
              if (stopMouseDown) e.stopPropagation();
              if (!disabled) onSelect(c.hex);
            }}
            className={`${sizeClass} rounded-full cursor-pointer border border-slate-300 dark:border-slate-600 transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed btn-press ${
              isSelected ? ringClass.selected : ringClass.unselected
            }`}
          />
        );
      })}

      {showCustomPicker && (
        <label
          title="Choose custom color"
          className={`relative ${sizeClass} rounded-full cursor-pointer border border-slate-300 dark:border-slate-600 flex items-center justify-center bg-gradient-to-tr from-pink-500 via-amber-400 to-indigo-500 hover:scale-110 transition-transform shrink-0 btn-press ${
            disabled ? 'opacity-30 pointer-events-none' : ''
          }`}
        >
          <Palette className="w-3.5 h-3.5 text-white drop-shadow" />
          <input
            type="color"
            value={selectedColor}
            disabled={disabled}
            aria-label="Choose custom color"
            onChange={(e) => onSelect(e.target.value)}
            className="sr-only"
          />
        </label>
      )}
    </div>
  );
};
