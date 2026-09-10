// Color consistency helpers across Light and Dark themes

export function isColorBlack(color?: string): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  return (
    c === '#0f172a' ||
    c === '#000000' ||
    c === '#000' ||
    c === '#000000ff' ||
    c === '#1e293b' ||
    c === '#020617' ||
    c === 'black' ||
    c.startsWith('rgb(0, 0, 0') ||
    c.startsWith('rgba(0, 0, 0') ||
    c.startsWith('rgb(15, 23, 42') ||
    c.startsWith('rgba(15, 23, 42')
  );
}

export function isColorWhite(color?: string): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  return (
    c === '#ffffff' ||
    c === '#fff' ||
    c === '#ffffffff' ||
    c === '#f8fafc' ||
    c === '#f1f5f9' ||
    c === 'white' ||
    c.startsWith('rgb(255, 255, 255') ||
    c.startsWith('rgba(255, 255, 255')
  );
}


// Return high-contrast ink color for given theme
export function getThemeDefaultColor(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? '#ffffff' : '#0f172a';
}

// Get effective display color ensuring contrast against canvas background
export function getAdaptiveDisplayColor(color: string | undefined, theme: 'light' | 'dark'): string {
  const fallback = theme === 'dark' ? '#ffffff' : '#0f172a';
  if (!color) return fallback;

  if (theme === 'dark' && isColorBlack(color)) {
    return '#ffffff';
  }
  if (theme === 'light' && isColorWhite(color)) {
    return '#0f172a';
  }
  return color;
}
