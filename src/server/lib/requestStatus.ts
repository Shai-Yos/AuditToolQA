// Terminal request statuses that stop the "time open" counter.
// Matched case-insensitively against RequestStatus.name.
const TERMINAL_STATUS_NAMES = new Set(["closed", "cancelled", "on hold"]);

export function isTerminalStatus(name: string | null | undefined): boolean {
  if (!name) return false;
  return TERMINAL_STATUS_NAMES.has(name.trim().toLowerCase());
}

/**
 * Computes the `closedAt` value for a status transition.
 * - Entering a terminal status from non-terminal: stamp now.
 * - Leaving a terminal status: clear to null.
 * - Staying within terminal statuses: preserve the existing closedAt.
 * - Staying within non-terminal statuses: preserve null.
 */
export function computeClosedAt(params: {
  fromStatusName: string | null | undefined;
  toStatusName: string;
  currentClosedAt: Date | null;
}): Date | null {
  const wasTerminal = isTerminalStatus(params.fromStatusName);
  const willBeTerminal = isTerminalStatus(params.toStatusName);

  if (willBeTerminal && !wasTerminal) return new Date();
  if (!willBeTerminal) return null;
  return params.currentClosedAt;
}
