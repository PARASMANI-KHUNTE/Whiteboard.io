/**
 * Theme toggling only rewrites persisted element colors when the local user is
 * allowed to edit the board. Viewers get the display theme change without any
 * element mutation or socket emission.
 */
export function shouldRecolorBoardOnThemeToggle(canWrite: boolean): boolean {
  return canWrite;
}
