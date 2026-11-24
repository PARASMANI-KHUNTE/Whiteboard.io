export interface ColorOption {
  hex: string;
  label: string;
}

/** Curated core colors shared across drawing tools and item editors. */
export const CORE_PALETTE: ColorOption[] = [
  { hex: '#0f172a', label: 'Charcoal Black' },
  { hex: '#ffffff', label: 'Snow White' },
  { hex: '#ef4444', label: 'Vibrant Coral' },
  { hex: '#3b82f6', label: 'Ocean Blue' },
  { hex: '#10b981', label: 'Forest Green' },
  { hex: '#f59e0b', label: 'Amber Sun' },
  { hex: '#8b5cf6', label: 'Royal Violet' },
  { hex: '#ec4899', label: 'Berry Pink' },
  { hex: '#06b6d4', label: 'Electric Cyan' },
];

/** Toolbar drawing palette (stays compact beside custom color picker). */
export const TOOLBAR_COLORS: ColorOption[] = CORE_PALETTE.filter(
  (c) => c.hex !== '#ec4899'
);

/** Wire / connector palette adding Orange and Yellow accents. */
export const WIRE_PALETTE: ColorOption[] = [
  { hex: '#0f172a', label: 'Charcoal Black' },
  { hex: '#ffffff', label: 'Snow White' },
  { hex: '#ef4444', label: 'Vibrant Coral' },
  { hex: '#f97316', label: 'Sunset Orange' },
  { hex: '#eab308', label: 'Solar Yellow' },
  { hex: '#10b981', label: 'Forest Green' },
  { hex: '#06b6d4', label: 'Electric Cyan' },
  { hex: '#3b82f6', label: 'Ocean Blue' },
  { hex: '#8b5cf6', label: 'Royal Violet' },
  { hex: '#ec4899', label: 'Berry Pink' },
];

/** User profile cursor and avatar accent colors. */
export const USER_PROFILE_PALETTE: ColorOption[] = [
  { hex: '#ef4444', label: 'Vibrant Coral' },
  { hex: '#3b82f6', label: 'Ocean Blue' },
  { hex: '#10b981', label: 'Forest Green' },
  { hex: '#f59e0b', label: 'Amber Sun' },
  { hex: '#8b5cf6', label: 'Royal Violet' },
  { hex: '#ec4899', label: 'Berry Pink' },
];

export interface StickyColorOption {
  name: string;
  bg: string;
  topBorder: string;
  text: string;
}

/** Sticky note surface themes paired with high-contrast ink colors. */
export const STICKY_PALETTE: StickyColorOption[] = [
  { name: 'Yellow', bg: '#fef9c3', topBorder: '#fde047', text: '#334155' },
  { name: 'Blue', bg: '#eff6ff', topBorder: '#bfdbfe', text: '#334155' },
  { name: 'Green', bg: '#ecfdf5', topBorder: '#a7f3d0', text: '#334155' },
  { name: 'Pink', bg: '#fff1f2', topBorder: '#fecdd3', text: '#334155' },
];
