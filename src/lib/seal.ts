export const SEAL_RING_LENGTH = 274;
const GLYPH_WIDTH_EM = 0.62;
const MIN_GAP = 0.8;
const MAX_FONT = 10.5;

export function sealTextFit(text: string): { fontSize: number; letterSpacing: number; textLength: number } {
  const n = Math.max(1, [...text].length);
  const fontSize = Math.min(MAX_FONT, (SEAL_RING_LENGTH / n - MIN_GAP) / GLYPH_WIDTH_EM);
  const letterSpacing = Math.max(MIN_GAP, (SEAL_RING_LENGTH - n * fontSize * GLYPH_WIDTH_EM) / n);
  return { fontSize: round(fontSize), letterSpacing: round(letterSpacing), textLength: SEAL_RING_LENGTH };
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
