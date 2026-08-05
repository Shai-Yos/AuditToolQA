import { EventEmitter } from "events";

const g = globalThis as unknown as { __eventBus?: EventEmitter };

if (!g.__eventBus) {
  g.__eventBus = new EventEmitter();
  g.__eventBus.setMaxListeners(500);
}

export const bus = g.__eventBus;

/** Emit an event for a specific audit */
export function emitAuditEvent(auditId: string, event: string) {
  bus.emit(`audit:${auditId}`, event);
}

/** Emit an event for the global audit list */
export function emitGlobalEvent(event: string) {
  bus.emit("audits", event);
}

/** Emit a notification event for a specific user */
export function emitNotification(userId: string) {
  bus.emit(`notifications:${userId}`, "new");
}

/** Emit an event for a specific request (comments, notes) */
export function emitRequestEvent(requestId: string, event: string) {
  bus.emit(`request:${requestId}`, event);
}

/** Emit a role/status change event for a specific user */
export function emitUserEvent(userId: string, event: string) {
  bus.emit(`user:${userId}`, event);
}

/** Emit a feedback event (triggers refresh on feedback pages) */
export function emitFeedbackEvent() {
  bus.emit("feedback", "updated");
}
