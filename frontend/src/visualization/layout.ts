/** Below this rendered width (phones) the label column does not fit beside the face. */
const COMPACT_MAX_WIDTH = 520

/**
 * Compact overlays draw measurement lines without the label column; only the selected
 * measurement gets its value next to the line, and the full readout is the measurements list.
 */
export function isCompactOverlay(displayWidth: number): boolean {
  return displayWidth < COMPACT_MAX_WIDTH
}
