export const GREEN = "#22c55e"
export const YELLOW = "#eab308"
export const RED = "#ef4444"

export const GO_HEADING_COLOR = YELLOW
export const OPENAI_HEADING_COLOR = GREEN

export function usageColor(usedPercent: number): string {
  if (usedPercent >= 70) return GREEN
  if (usedPercent >= 30) return YELLOW
  return RED
}
