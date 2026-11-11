/**
 * Single source of truth for every keyboard shortcut the canvas understands.
 *
 * The canvas keydown handler and the shortcuts cheat sheet both read from this
 * list so a shortcut can never drift out of sync with its documentation.
 */

export type ShortcutKey = string;

export interface ShortcutDefinition {
  /** Key combinations rendered as individual <kbd> chips. */
  keys: ShortcutKey[];
  label: string;
  description?: string;
}

export interface ShortcutSection {
  title: string;
  shortcuts: ShortcutDefinition[];
}

/** Cross-platform label for the primary modifier key. */
export const MOD_KEY = 'Ctrl';

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Tools',
    shortcuts: [
      { keys: ['V'], label: 'Select tool', description: 'Pick, move and edit objects' },
      { keys: ['H'], label: 'Hand tool', description: 'Pan around the board' },
      { keys: ['P'], label: 'Pen tool', description: 'Freehand drawing' },
      { keys: ['Y'], label: 'Highlighter', description: 'Translucent marker' },
      { keys: ['E'], label: 'Eraser', description: 'Erase strokes and objects' },
      { keys: ['S'], label: 'Sticky note', description: 'Drop a new note' },
      { keys: ['T'], label: 'Text', description: 'Add a text element' },
      { keys: ['R'], label: 'Shape', description: 'Draw the selected shape' },
      { keys: ['I'], label: 'Icon / sticker', description: 'Place the selected icon' },
      { keys: ['W'], label: 'Wire / connector', description: 'Connect two objects' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['Click'], label: 'Select object' },
      { keys: ['Shift', 'Click'], label: 'Add to selection' },
      { keys: ['Drag'], label: 'Marquee select', description: 'Drag on empty canvas' },
      { keys: [MOD_KEY, 'A'], label: 'Select all' },
      { keys: ['Esc'], label: 'Clear selection / close menu' },
      { keys: ['Del'], label: 'Delete selection', description: 'Backspace works too' },
      { keys: ['Right-click'], label: 'Open context menu' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: ['Alt', 'Drag'], label: 'Duplicate while dragging' },
      { keys: [MOD_KEY, 'D'], label: 'Duplicate selection' },
      { keys: [MOD_KEY, 'C'], label: 'Copy' },
      { keys: [MOD_KEY, 'X'], label: 'Cut' },
      { keys: [MOD_KEY, 'V'], label: 'Paste', description: 'Works across rooms' },
      { keys: ['↑', '↓', '←', '→'], label: 'Nudge 1px' },
      { keys: ['Shift', 'Arrow'], label: 'Nudge 10px' },
      { keys: [MOD_KEY, 'Z'], label: 'Undo' },
      { keys: [MOD_KEY, 'Shift', 'Z'], label: 'Redo' },
    ],
  },
  {
    title: 'View & help',
    shortcuts: [
      { keys: ['Space', 'Drag'], label: 'Pan canvas' },
      { keys: ['Middle', 'Drag'], label: 'Pan canvas' },
      { keys: [MOD_KEY, 'Wheel'], label: 'Zoom to cursor' },
      { keys: ['+'], label: 'Zoom in' },
      { keys: ['−'], label: 'Zoom out' },
      { keys: ['0'], label: 'Reset zoom & position' },
      { keys: ['?'], label: 'Open this cheat sheet' },
    ],
  },
];
