export const MANDATORY_REQUEST_STATUS_NAMES = [
  "Incoming",
  "Closed",
  "Cancelled",
  "On Hold",
] as const;

function normalizeStatusName(name: string): string {
  return name.trim().toLowerCase();
}

const MANDATORY_STATUS_SET = new Set(
  MANDATORY_REQUEST_STATUS_NAMES.map((name) => normalizeStatusName(name)),
);

export function isMandatoryRequestStatus(name: string): boolean {
  return MANDATORY_STATUS_SET.has(normalizeStatusName(name));
}

export function validateMandatoryRequestStatuses(
  statuses: Array<{ name: string }>,
): { ok: true } | { ok: false; error: string } {
  const names = statuses.map((s) => normalizeStatusName(s.name));

  const missing = MANDATORY_REQUEST_STATUS_NAMES.filter(
    (required) => !names.includes(normalizeStatusName(required)),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing mandatory status(es): ${missing.join(", ")}.`,
    };
  }

  const incomingIdx = names.indexOf(normalizeStatusName("Incoming"));
  if (incomingIdx !== 0) {
    return {
      ok: false,
      error: '"Incoming" must stay as the first status.',
    };
  }

  const closedIdx = names.indexOf(normalizeStatusName("Closed"));
  const cancelledIdx = names.indexOf(normalizeStatusName("Cancelled"));
  const onHoldIdx = names.indexOf(normalizeStatusName("On Hold"));
  if (!(closedIdx < cancelledIdx && cancelledIdx < onHoldIdx)) {
    return {
      ok: false,
      error: 'Mandatory status order must remain: Closed -> Cancelled -> On Hold.',
    };
  }

  return { ok: true };
}
