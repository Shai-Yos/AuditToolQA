# Audits Management Tool — User Requirements

**Document Version:** 1.0  
**Date:** July 5, 2026  
**Application:** Internal Audits Management Web Application  
**Platform:** Philips Internal (https://audits.ilqhfaatc1vwap2.code1.emi.philips.com)

---

## Table of Contents

1. [Scope & Purpose](#scope--purpose)
2. [User Roles](#user-roles)
3. [Functional Requirements (FR)](#functional-requirements)
4. [Non-Functional Requirements (NFR)](#non-functional-requirements)

---

## Scope & Purpose

The Audits Management Tool is an internal web application designed to plan, execute, and track internal audits. It supports the full audit lifecycle — from creation and team assignment through request tracking, real-time collaboration (chat + transcription), document management, and reporting — for Admin, Audit Owner, and Regular User roles across the Philips organisation.

---

## User Roles

| Role | Description |
|---|---|
| **ADMIN** | Full platform control: creates/edits/deletes audits, manages all users and roles, views all data, configures request statuses. |
| **AUDIT_OWNER** | Creates and manages their own audits, assigns team members, manages rooms and roles within owned audits. |
| **USER** | Participates in assigned audits: creates requests, uploads documents, joins chat channels, views assigned audit data. |

---

## Functional Requirements

### FR-01 — Authentication & Session Management

| ID | Requirement |
|---|---|
| FR-01.1 | The system SHALL authenticate users via Microsoft Azure Active Directory (Azure AD) using OAuth 2.0. |
| FR-01.2 | Upon successful login, the system SHALL redirect the user to their role-specific dashboard (Admin → `/adminDashboard`, Audit Owner → `/auditOwnerDashboard`, User → `/userDashboard`). |
| FR-01.3 | The system SHALL maintain a session cookie (`audit_user_email`) with a defined TTL (1 hour). |
| FR-01.4 | The system SHALL invalidate the session on logout and redirect to the login page. |
| FR-01.5 | The system SHALL prevent cross-role access (e.g., a User accessing the Admin dashboard) via server-side middleware. |
| FR-01.6 | The system SHALL sync Azure AD user data (name, email, photo) to the local database on login. |

---

### FR-02 — Role-Based Access Control (RBAC)

| ID | Requirement |
|---|---|
| FR-02.1 | The system SHALL assign roles (ADMIN, AUDIT_OWNER, USER) via Azure AD group membership, with the ability for Admins to override individual roles in the database. |
| FR-02.2 | Admins SHALL have unrestricted read and write access to all audits, requests, users, chats, and files. |
| FR-02.3 | Audit Owners SHALL be able to create audits and manage only the audits they own or are assigned to. |
| FR-02.4 | Regular Users SHALL only view and interact with audits they are explicitly assigned to. |
| FR-02.5 | The system SHALL block Users from accessing chat channels if they are not assigned to that audit. Admins are exempt. |
| FR-02.6 | Only Admins SHALL be able to delete audits, users, or feedback entries. |

---

### FR-03 — User Management

| ID | Requirement |
|---|---|
| FR-03.1 | Admins SHALL be able to search for users by name or email (via Microsoft Graph API and local DB). |
| FR-03.2 | Admins SHALL be able to add users to the platform by importing them from Azure AD. |
| FR-03.3 | Admins SHALL be able to change a user's platform role (ADMIN / AUDIT_OWNER / USER) from the Users management page. |
| FR-03.4 | Admins SHALL be able to remove a user from the platform. |
| FR-03.5 | The system SHALL display user statistics: total users, count per role (Admins, Audit Owners, Users). |
| FR-03.6 | The system SHALL auto-create placeholder user records when unregistered employees are assigned to audits, to be resolved upon first login. |
| FR-03.7 | A scheduled cron job SHALL synchronise user data from Azure AD to the local database. |

---

### FR-04 — Audit Lifecycle Management

| ID | Requirement |
|---|---|
| FR-04.1 | Admins and Audit Owners SHALL be able to create a new audit via a multi-step form capturing: title, description, start/end dates, timezone, Front Room count, Back Room count, room role assignments, and default request statuses. |
| FR-04.2 | The system SHALL auto-generate a unique track ID in the format `YYYY-####` for each audit (e.g., `2026-0001`), reusing IDs from deleted audits. |
| FR-04.3 | An audit SHALL progress through the statuses: **DRAFT → ACTIVE → COMPLETED**. |
| FR-04.4 | Admins SHALL be able to manually change an audit's status. |
| FR-04.5 | The system SHALL automatically transition audits to COMPLETED when their end date has passed (via scheduled cron job). |
| FR-04.6 | Admins SHALL be able to edit all audit details (title, dates, room counts, role assignments). |
| FR-04.7 | Admins SHALL be able to delete an audit, which also removes all associated data (requests, files, chat messages). |
| FR-04.8 | The system SHALL implement page-level edit locking with a 30-second heartbeat to prevent conflicting edits from multiple users simultaneously. |
| FR-04.9 | The system SHALL display an audit overview including status breakdown, request statistics, and recent activity. |

---

### FR-05 — Room & Role Configuration

| ID | Requirement |
|---|---|
| FR-05.1 | An audit SHALL support up to 50 Front Rooms (FR) and up to 50 Back Rooms (BR). |
| FR-05.2 | Each room SHALL have configurable roles including: Lead, QM (Quality Manager), SME (Subject Matter Expert), Caller, and custom roles. |
| FR-05.3 | Admins SHALL be able to assign specific users to specific room roles within an audit (e.g., "FR1 Lead", "BR2 Caller"). |
| FR-05.4 | The system SHALL display the full team assignment matrix per audit (user ↔ room ↔ role). |

---

### FR-06 — Request Management

| ID | Requirement |
|---|---|
| FR-06.1 | Admins and assigned Users SHALL be able to create requests within an audit, capturing: title, labels, formal flag, and initial status. |
| FR-06.2 | The system SHALL auto-generate a sequential track number for each request within an audit (e.g., `REQ-001`). |
| FR-06.3 | Admins SHALL be able to configure custom request statuses per audit (name, colour, order). |
| FR-06.4 | Admins SHALL be able to move a request between statuses via a drag-and-drop Kanban board. |
| FR-06.5 | Users SHALL be able to update the status of requests in their assigned audits. |
| FR-06.6 | Requests SHALL support free-form labels/tags (e.g., "Financial", "Compliance"). |
| FR-06.7 | A request MAY be marked as **Formal**, indicating it requires elevated review. |
| FR-06.8 | Multiple users MAY be assigned to a single request. |
| FR-06.9 | Each request SHALL have a single shared collaborative note with last-editor tracking. |
| FR-06.10 | Requests SHALL support a threaded comments section for discussion. |
| FR-06.11 | Admins SHALL be able to view all requests globally across all audits with filtering by audit and status. |
| FR-06.12 | The system SHALL implement request-level edit locking (30-second heartbeat) to prevent conflicting edits. |

---

### FR-07 — Document & File Management

| ID | Requirement |
|---|---|
| FR-07.1 | Users SHALL be able to upload documents to individual requests (any file type). |
| FR-07.2 | Users SHALL be able to download documents attached to requests they have access to. |
| FR-07.3 | Admins SHALL be able to delete documents from requests. |
| FR-07.4 | Files SHALL be stored on Microsoft OneDrive (CTAMI-Automations account) with automatic fallback to local disk storage. |
| FR-07.5 | Each audit SHALL have two file slots: **Agenda** (shared agenda files) and **Ready Box** (supporting documents for the audit). |
| FR-07.6 | Users SHALL be able to download all files in an audit folder as a single ZIP archive. |
| FR-07.7 | The system SHALL support three global document repositories: **Annual Audit Plan**, **Risk Assessments**, and **SIRT** (Site Investigation Response Team). |
| FR-07.8 | Regular Users SHALL have read-only access to global document repositories; Admins SHALL have full upload/delete access. |
| FR-07.9 | Uploaded files associated with a deleted entity (request, audit) SHALL be automatically purged from storage. |

---

### FR-08 — Chat & Real-Time Collaboration

| ID | Requirement |
|---|---|
| FR-08.1 | Each Front Room and Back Room SHALL have its own dedicated communication chat channel and a transcription channel (e.g., `fr1-comm`, `fr1-transcription`). |
| FR-08.2 | Assigned users SHALL be able to send text messages in their audit's chat channels. |
| FR-08.3 | The chat SHALL support `@mention` of users, which triggers a notification to the mentioned user. |
| FR-08.4 | Users SHALL be able to reply to a specific message (threaded replies). |
| FR-08.5 | Users SHALL be able to attach files to chat messages, stored on OneDrive. |
| FR-08.6 | Users SHALL be able to edit and delete their own chat messages. |
| FR-08.7 | The system SHALL show a **typing indicator** when one or more users are composing a message. |
| FR-08.8 | The chat SHALL display a paginated history (up to 200 messages per load) with the ability to load older messages. |
| FR-08.9 | Only users assigned to an audit SHALL be able to access its chat channels. Admins are exempt from this restriction. |
| FR-08.10 | Users SHALL be able to create a new request directly from the chat composer. |

---

### FR-09 — Transcription Management

| ID | Requirement |
|---|---|
| FR-09.1 | Each room SHALL have a rich-text transcription panel (using a Tiptap-based editor) for recording meeting notes and findings. |
| FR-09.2 | Admins and Audit Owners SHALL be able to edit transcription content (formatting: bold, italic, lists, headings). |
| FR-09.3 | Regular Users SHALL have read-only access to the transcription panel. |
| FR-09.4 | Transcription content SHALL be saved and persisted per audit room channel. |

---

### FR-10 — Notifications

| ID | Requirement |
|---|---|
| FR-10.1 | The system SHALL generate in-app notifications for the following events: audit assignment, request creation, chat mention, chat reply, request status change, and admin feedback replies. |
| FR-10.2 | Notifications SHALL be delivered in real-time via Server-Sent Events (SSE). |
| FR-10.3 | Users SHALL be able to mark individual notifications or all notifications as read. |
| FR-10.4 | Users SHALL be able to configure notification preferences per category (assignments, mentions, activity, chat) from their profile page. |
| FR-10.5 | The notification bell SHALL display an unread count badge in the application header. |
| FR-10.6 | Each notification SHALL contain a deep-link navigating the user to the relevant audit, request, or chat. |

---

### FR-11 — Activity Logging

| ID | Requirement |
|---|---|
| FR-11.1 | The system SHALL record an activity log entry for every significant action: audit created/updated/deleted, request created/moved/closed, file uploaded, user assigned, chat message sent. |
| FR-11.2 | Each log entry SHALL capture: the action type, the actor (user name), the target entity (audit/request ID), a timestamp, and optional metadata (e.g., old vs. new values). |
| FR-11.3 | Admins SHALL be able to view the activity log for a specific audit on the audit detail page. |
| FR-11.4 | Admins SHALL be able to export the global activity log as a CSV file. |

---

### FR-12 — Reporting & Export

| ID | Requirement |
|---|---|
| FR-12.1 | Admins SHALL be able to export full audit data (requests, statuses, assignees, chat history) as a structured file. |
| FR-12.2 | The admin dashboard SHALL display summary statistics: total audits, active audits, total requests, and recent activity feed. |
| FR-12.3 | The audit detail page SHALL display per-audit metrics: request count per status, average request resolution time, and team breakdown. |

---

### FR-13 — Calendar Integration

| ID | Requirement |
|---|---|
| FR-13.1 | The system SHALL automatically create an Outlook calendar event when an audit is created, using the audit's start/end dates, title, timezone, and assigned users as attendees. |
| FR-13.2 | The system SHALL update the calendar event when audit details (dates, title, assignees) are changed. |
| FR-13.3 | The system SHALL cancel/delete the calendar event when an audit is deleted. |

---

### FR-14 — Feedback System

| ID | Requirement |
|---|---|
| FR-14.1 | Any authenticated user SHALL be able to submit feedback via an in-app widget, including a 1–5 star rating and optional comment. |
| FR-14.2 | Admins SHALL be able to view all submitted feedback, filtered by rating, on a dedicated feedback management page. |
| FR-14.3 | Admins SHALL be able to reply to individual feedback entries. |
| FR-14.4 | The user who submitted feedback SHALL receive an in-app notification when their feedback receives an admin reply. |
| FR-14.5 | Admins SHALL be able to delete feedback entries. |
| FR-14.6 | Users SHALL be able to view their own submitted feedback and any admin replies from their profile/feedback page. |

---

### FR-15 — Profile & Preferences

| ID | Requirement |
|---|---|
| FR-15.1 | All users SHALL have a profile page displaying their name, email, role, and avatar (sourced from Azure AD). |
| FR-15.2 | Users SHALL be able to configure notification preferences per event category from their profile page. |
| FR-15.3 | The admin profile page SHALL additionally show account management options. |

---

## Non-Functional Requirements

### NFR-01 — Performance

| ID | Requirement |
|---|---|
| NFR-01.1 | Page load time for primary dashboard views (admin, user) SHALL be under **3 seconds** on a standard corporate network connection. |
| NFR-01.2 | API response time for standard CRUD operations (create/read/update request, send chat message) SHALL be under **1 second** at the 95th percentile. |
| NFR-01.3 | The chat polling interval SHALL not place undue load on the server; polling SHOULD be adaptive (back off when the tab is inactive). |
| NFR-01.4 | File uploads SHALL support files up to **50 MB** without timeout or error. |
| NFR-01.5 | The Kanban board SHALL render up to **200 requests** without noticeable rendering lag. |

---

### NFR-02 — Security

| ID | Requirement |
|---|---|
| NFR-02.1 | All data in transit SHALL be encrypted using TLS 1.2 or higher (HTTPS only). |
| NFR-02.2 | Authentication SHALL use industry-standard OAuth 2.0 / OpenID Connect flows via Azure AD; no credentials are stored in the database. |
| NFR-02.3 | All server-side actions SHALL validate the authenticated user's role and permissions before executing (no reliance on client-side role checks alone). |
| NFR-02.4 | The application SHALL protect against OWASP Top 10 vulnerabilities, including SQL injection (mitigated by Prisma ORM parameterised queries), XSS (mitigated by React's output escaping and Zod validation), and CSRF (mitigated by Next.js server actions token validation). |
| NFR-02.5 | Uploaded files SHALL be served through an authenticated proxy endpoint; direct public URLs to storage SHALL NOT be exposed to unauthorised users. |
| NFR-02.6 | Session cookies SHALL be HTTP-only, Secure, and SameSite=Lax to prevent client-side access and cross-site request forgery. |
| NFR-02.7 | All user inputs on Server Actions and tRPC procedures SHALL be validated using Zod schemas before processing. |
| NFR-02.8 | File uploads SHALL be validated for type and size before being written to storage. |
| NFR-02.9 | Azure AD client secrets and database credentials SHALL be stored as environment variables and NEVER committed to source control. |

---

### NFR-03 — Availability & Reliability

| ID | Requirement |
|---|---|
| NFR-03.1 | The application SHALL target **99.5% uptime** during business hours (Monday–Friday, 08:00–18:00 CET). |
| NFR-03.2 | The system SHALL handle OneDrive storage failures gracefully by falling back to local disk storage without data loss. |
| NFR-03.3 | Scheduled cron jobs (user sync, audit auto-completion) SHALL be idempotent — safe to re-run in the event of a partial failure. |
| NFR-03.4 | Database migrations SHALL be backward-compatible or applied with a maintenance window. |
| NFR-03.5 | The system SHOULD log all unhandled server errors with sufficient context for diagnosis. |

---

### NFR-04 — Scalability

| ID | Requirement |
|---|---|
| NFR-04.1 | The system SHALL support at least **500 concurrent users** without performance degradation. |
| NFR-04.2 | The database schema and queries SHALL support at least **10,000 audits** and **100,000 requests** without requiring architectural changes. |
| NFR-04.3 | The application SHALL be deployable as a standalone Next.js build, suitable for containerised deployment (Docker). |
| NFR-04.4 | The architecture SHALL allow horizontal scaling (additional server instances) without sharing session state in memory. |

---

### NFR-05 — Usability & Accessibility

| ID | Requirement |
|---|---|
| NFR-05.1 | The UI SHALL be responsive and fully usable on desktop browsers at screen widths from **1024px** and above. |
| NFR-05.2 | Interactive components (dropdowns, modals, buttons) SHALL be keyboard-navigable. |
| NFR-05.3 | All form validation errors SHALL be displayed inline, clearly identifying the failing field and providing a corrective message. |
| NFR-05.4 | Loading states SHALL be indicated with visual feedback (spinners, skeleton screens) for operations taking over 300ms. |
| NFR-05.5 | Destructive actions (delete audit, delete user) SHALL require a confirmation step before execution. |
| NFR-05.6 | The UI SHALL consistently apply role-specific colour coding (amber = Admin, indigo = Audit Owner, emerald = User) to aid quick visual identification. |
| NFR-05.7 | The application SHALL support English as the primary language. |

---

### NFR-06 — Maintainability

| ID | Requirement |
|---|---|
| NFR-06.1 | All database schema changes SHALL be managed through Prisma migrations committed to source control. |
| NFR-06.2 | The codebase SHALL follow the established conventions: Server Components by default, Client Components only when required (state/events), tRPC for queries, Server Actions for mutations. |
| NFR-06.3 | Shared server utilities SHALL reside under `src/server/lib/`; route-specific components SHALL remain within their route folder. |
| NFR-06.4 | Environment configuration SHALL be validated at startup via `src/env.js` (T3 Env pattern) to prevent misconfiguration from reaching production. |
| NFR-06.5 | The application SHALL include unit and integration tests for critical server logic (authentication, role resolution, request state transitions). |

---

### NFR-07 — Browser Compatibility

| ID | Requirement |
|---|---|
| NFR-07.1 | The application SHALL function correctly in the latest two major versions of **Google Chrome**, **Microsoft Edge**, and **Mozilla Firefox**. |
| NFR-07.2 | The application is NOT required to support Internet Explorer. |
| NFR-07.3 | Server-Sent Events (used for real-time notifications) SHALL be supported in all target browsers; a graceful fallback (polling) SHOULD be provided for unsupported environments. |

---

### NFR-08 — Integration Reliability

| ID | Requirement |
|---|---|
| NFR-08.1 | Microsoft Graph API calls SHALL implement retry logic with exponential back-off for transient failures (5xx, rate limit). |
| NFR-08.2 | Outlook Calendar integration failures SHALL NOT block audit creation; the system SHALL log the error and proceed without the calendar event. |
| NFR-08.3 | Azure AD user sync failures SHALL be logged and retried on the next scheduled run without affecting the current user session. |
| NFR-08.4 | OneDrive upload failures SHALL fall back to local disk storage transparently, with an admin-visible error log entry. |

---

### NFR-09 — Data Integrity

| ID | Requirement |
|---|---|
| NFR-09.1 | All audit track IDs (`YYYY-####`) SHALL be unique across the system; deleted IDs MAY be reused but SHALL NOT result in duplicate active records. |
| NFR-09.2 | Request track numbers (`REQ-###`) SHALL be unique within the scope of a single audit. |
| NFR-09.3 | Cascading deletes SHALL be defined at the database level (via Prisma relations) to ensure no orphaned records remain after an audit or request is deleted. |
| NFR-09.4 | Concurrent edits to the same record SHALL be managed via the page-locking mechanism; the system SHALL prevent silent overwrites. |
| NFR-09.5 | All user-facing mutations SHALL be wrapped in database transactions where they affect multiple related records. |

---

### NFR-10 — Compliance & Privacy

| ID | Requirement |
|---|---|
| NFR-10.1 | The application SHALL be hosted within the Philips internal network / approved cloud infrastructure. |
| NFR-10.2 | User personal data (name, email, photo) SHALL only be stored to the extent necessary for application function and SHALL be sourced from the authoritative Azure AD directory. |
| NFR-10.3 | Activity logs and audit trails SHALL be retained for a minimum of **12 months** to support internal audit requirements. |
| NFR-10.4 | The system SHALL not store Azure AD access tokens beyond the duration of the user session. |

---

*End of Requirements Document*
