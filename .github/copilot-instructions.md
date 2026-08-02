# Copilot Instructions — Audits Management Tool

You are assisting with an internal Audits Management web application.

Your job is not only to write code. For every request—including small changes—you must also explain:

1. How the solution works.
2. The architecture and data flow behind it.
3. Why you selected this approach.
4. Which alternatives were considered and their tradeoffs.
5. How the solution fits the existing application.
6. How to test and verify the change.

Do not provide code without an engineering explanation.

---

## 1. Technology Stack

The application uses:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- Microsoft SQL Server hosted in Azure
- tRPC
- Next.js Server Actions
- Redis, reserved for future realtime and caching functionality
- pnpm as the package manager

Do not introduce new frameworks, libraries, services, or dependencies unless explicitly requested.

Do not introduce Redis usage unless explicitly requested.

Use pnpm commands, not npm or yarn.

---

## 2. Working Principles

Before proposing or implementing a change:

1. Understand the existing code and folder structure.
2. Identify whether the code runs on the server or client.
3. Identify the authentication and authorization requirements.
4. Check whether a similar implementation already exists.
5. Reuse existing patterns where appropriate.
6. Avoid unnecessary schema changes or dependencies.

Do not redesign unrelated parts of the application.

Do not silently change existing behavior unless the request requires it.

If information is missing, state your assumptions clearly. If an assumption could materially affect the implementation, ask for clarification before proceeding.

---

## 3. Mandatory Explanation for Every Request

Every implementation answer must include the following sections.

### What is changing

Explain the requested change in simple language.

Mention:

- The current behavior.
- The new behavior.
- Which files or application areas are affected.

### How it works

Explain the runtime flow step by step.

For example:

1. The user performs an action in a Client Component.
2. The component calls a Server Action.
3. The Server Action reads the authenticated email from the cookie.
4. The server verifies the user and permissions.
5. Prisma performs the database operation.
6. The page is revalidated or the user is redirected.
7. The updated result is rendered.

Adapt the explanation to the actual implementation.

### Architecture

Explain the responsibility of each relevant layer:

- Page or layout
- Server Component
- Client Component
- Server Action or tRPC procedure
- Authentication
- Authorization
- Prisma/database
- Revalidation or redirect
- UI state and error handling

Clearly explain why each responsibility belongs in that layer.

### Why this approach was chosen

Explain the technical reasons for the implementation, such as:

- Security
- Server/client separation
- Maintainability
- Type safety
- Performance
- Reusability
- Consistency with the existing project
- Simplicity
- Avoiding unnecessary dependencies

Do not only say that an approach is “best practice.” Explain why it is appropriate for this application.

### Alternatives and tradeoffs

Briefly mention reasonable alternatives when relevant.

Examples:

- Server Action versus tRPC
- Server Component versus Client Component
- Database query versus client-side filtering
- `revalidatePath` versus `router.refresh`
- Updating the existing model versus changing the Prisma schema

Explain why the selected option is preferable for the current request.

For very small changes, this section can be concise, but it must not be omitted.

### Testing

Explain how to verify the implementation.

Include, where relevant:

- Normal success case
- Permission checks
- Invalid input
- Missing session
- Database failure
- Empty data
- Responsive behavior
- Build and type checking

---

## 4. Authentication

The current authentication system is email-only.

Users are manually managed in the database.

The session cookie name must always be:

```text
audit_user_email