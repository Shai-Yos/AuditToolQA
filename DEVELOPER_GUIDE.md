# Developer Guide (Deep Mode)

This document is the engineering-facing technical guide for the Audits Tool repository.

If you are brand new, read sections 1 to 5 first. If you are implementing features, jump to sections 10 to 16.

## 1. System Purpose

Audits Tool is an internal, role-based platform to run an end-to-end audit workflow:
- planning and creating audits
- assigning users and room roles
- creating and tracking requests
- running chat and transcription
- managing files and exports
- logging activity and sending in-app notifications

Repository root:
- `AuditsTool/`

## 2. Source of Truth Notes

Historical docs in this repo include older architecture assumptions. For current behavior, treat these as source-of-truth order:
1. runtime code under `src/`
2. `prisma/schema.prisma`
3. this document
4. historical docs (`README.md`, older requirement snapshots)

## 3. Architecture Overview

The app follows a layered shape:

- Presentation layer: Next.js App Router pages (`src/app/**`)
- UI layer: shared components (`src/components/**`)
- Domain/API layer: server actions, API routes, tRPC routers
- Data/integration layer: Prisma, Graph integration, notification/event utilities

Request path (typical):
1. user interacts with client component
2. client invokes server action or route handler
3. server enforces authorization guard
4. business logic updates DB and emits events/logs
5. client refreshes view (`router.refresh()`)

## 4. Stack and Runtime

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS v4
- Prisma 6 with SQL Server
- NextAuth v5 (Azure AD provider)
- tRPC + React Query
- Redis for realtime-related signaling/pub-sub paths
- pnpm package manager

### Frontend Stack

- Next.js 15 App Router (React server/client components)
- TypeScript
- Tailwind CSS v4
- React Query (via tRPC client integration)
- Role-based dashboard UI under `src/app/**` and shared components under `src/components/**`

### Backend Stack

- Next.js server actions + API routes (`src/app/api/**`)
- tRPC routers and procedures
- Prisma 6 ORM
- SQL Server (primary relational database)
- NextAuth v5 with Azure AD for authentication
- Redis for realtime/event-related capabilities
- Server-side authorization helpers (`requireUser`, `requireAdmin`, `requireAuditOwner`)

## 5. Local Setup

### Prerequisites
- Node.js LTS
- pnpm
- valid env values and access to required backing services

### Install and run

```bash
cd AuditsTool
pnpm install
pnpm dev
```

Local URL:
- `http://localhost:3001`

### Common scripts

```bash
pnpm typecheck
pnpm lint
pnpm db:push
pnpm db:studio
pnpm db:generate
```

## 6. Environment and Validation

Use:
- `AuditsTool/.env`

Core env values include:
- `AUTH_SECRET`
- `AUTH_TRUST_HOST`
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `AZURE_AD_TENANT_ID`
- `DATABASE_URL`
- `REDIS_URL`
- `INTERNAL_LOG_TOKEN`

Validation lives in:
- `src/env.js`

Guidance:
- Do not commit secrets.
- Avoid setting `AUTH_URL` unless deployment topology requires explicit host override.
- Keep `.env` strictly key=value. Stray text causes hard-to-debug runtime failures.

## 7. Directory Map (Practical)

- `src/app/`
  - role dashboards (`adminDashboard`, `auditOwnerDashboard`, `userDashboard`)
  - API routes (`src/app/api/**`)
  - route-local server actions
- `src/components/`
  - reusable view components, including shared audit card UI
- `src/server/db.ts`
  - Prisma singleton
- `src/server/helpers/`
  - auth guards, activity logging, notifications
- `src/server/lib/`
  - integrations and cross-cutting service utilities
- `src/trpc/`
  - client and hydration bindings
- `prisma/schema.prisma`
  - data model and relations

## 8. Auth and RBAC Model

Roles:
- `ADMIN`
- `AUDIT_OWNER`
- `USER`

Enforcement:
- route guard in `src/middleware.ts`
- server guards in `src/server/helpers/currentUser.ts`
  - `requireUser()`
  - `requireAdmin()`
  - `requireAuditOwner()`

Important rule:
- Database role is source of truth for app authorization.
- Azure groups are used for initial identity alignment and external sync, not final runtime authorization.

## 9. Audit and Request Lifecycle

Audit statuses:
- `DRAFT`
- `ACTIVE`
- `COMPLETED`
- `ARCHIVED`

Current UX policy:
- cancel => move audit to `ARCHIVED`
- rework => move archived audit back to `DRAFT`
- action visibility:
  - Cancel shown only when not archived
  - Rework shown only when archived

Request lifecycle:
- request status is per-audit configurable columns
- status moves are done through board/list actions
- cancel/rework request operations run server-side and emit activity/events

## 10. Realtime and Refresh Strategy

The app uses event-driven refresh patterns (SSE/event-bus style). Typical behavior:
- mutation runs server-side
- server emits relevant audit/global event
- clients refresh (`router.refresh()`) on event reception

When adding a new mutation, ensure:
1. DB update is committed
2. activity log event recorded
3. event emit called for affected views

## 11. Activity Logging and Notification Pipeline

Core logger:
- `src/server/helpers/logActivity.ts`

When adding a new activity type:
1. add string to `ActivityType` union
2. add label/icon in UI surfaces that render activity
3. add export mapping in activity export route
4. optionally add notification mapping in `NOTIFICATION_MAP`

Recent event added:
- `AUDIT_REWORKED`

Common compile failure:
- `Type '"NEW_EVENT"' is not assignable to type 'ActivityType'`
- root cause: event used in action but missing in union

## 12. Server Actions: Design Contract

For every new action:
1. Authenticate and authorize first (`require*` helper)
2. Load minimal required data
3. Validate business preconditions
4. Perform write(s)
5. Log activity
6. Emit refresh events
7. Return deterministic `{ ok, error? }` style payload

Do not rely on client-only guards for sensitive operations.

## 13. UI State Patterns That Matter

Known issue class:
- action label flicker after status-changing mutation during refresh

Recommended fix pattern (already used in key views):
- keep mutually exclusive rendering for conflicting actions
- reset loading flags on status changes

Example scenario:
- Cancel button in progress
- status flips to archived after refresh
- avoid momentary transition to Rework loading label

## 14. Testing Strategy

Minimum for feature branches:
1. `pnpm typecheck`
2. `pnpm lint`
3. role walkthrough for impacted flows (admin/owner/user)
4. state-transition checks for statuses and buttons

If your change affects activity/notifications:
- verify activity record appears
- verify export labels
- verify links in notifications resolve correctly

## 15. Troubleshooting Runbook

### Build errors for activity type
- file: `src/server/helpers/logActivity.ts`
- ensure event in `ActivityType`

### Wrong auth redirect host
- verify host/proxy headers
- verify Azure redirect URI registration
- verify env (`AUTH_TRUST_HOST`, optional `AUTH_URL` usage)

### Prisma runtime/constructor noise
- validate `DATABASE_URL` syntax
- ensure `.env` has only valid env lines

### Role mismatch behavior
- inspect DB-stored role, not only Azure group state

## 16. Feature Playbooks

### A. Add a new admin action button
1. implement server action in `src/app/adminDashboard/actions.ts`
2. enforce guard + business rule
3. add activity log entry and event emit
4. wire button in:
   - shared card: `src/components/audit-card.tsx`
   - audit home: `src/app/adminDashboard/audits/[auditId]/ui.tsx`
5. verify owner/dashboard variants if shared component is used

### B. Add a new lifecycle status behavior
1. update action logic
2. update status-to-label mappings in all affected UIs
3. update button-visibility rules
4. update activity labels/exports

### C. Extend audit export
1. update `src/app/api/audits/[auditId]/export/route.ts`
2. keep backward-compatible sheet/column names if consumers depend on them

### D. Update RBAC policy
1. middleware rules (`src/middleware.ts`)
2. server guard use (`require*`)
3. page/action-level checks
4. validate all three roles against impacted routes

## 17. Engineering Conventions

- Authorization-first server actions
- Small scoped commits
- Preserve existing lifecycle semantics unless product requires change
- Update this guide when introducing cross-cutting behavior
- Prefer explicit status checks over implicit assumptions

## 18. Quick Start for New Engineers (One Day Plan)

1. Boot app locally and sign in with test role accounts.
2. Read these files first:
   - `src/middleware.ts`
   - `src/server/helpers/currentUser.ts`
   - `src/server/helpers/logActivity.ts`
   - `src/components/audit-card.tsx`
3. Trace one flow end-to-end:
   - cancel audit
   - observe status update, activity log, UI refresh
4. Make a tiny UI-only change and run lint/typecheck.
5. Make one server action change with a role guard and verify behavior.
