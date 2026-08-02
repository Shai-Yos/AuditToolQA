# Audits Tool

Internal web app for managing audits with **Front/Back room pairs**, request tracking, and role-based dashboards.

## Tech Stack
- **Next.js (App Router) + TypeScript**
- **Tailwind CSS**
- **tRPC**
- **PostgreSQL + Prisma**
- **Redis** (optional / future: realtime, cache, queues)

> Current auth mode: **Option A (email-only login)**  
> Users are created manually in the DB. Login verifies the email exists, then stores a cookie session.

---

## Purpose
The Audits Tool helps run audits by organizing:
- **Audits** (title, lifecycle)
- **Pairs**: each audit has N “pairs” (Front room + Back room)
- **Assignments**: users are assigned to a pair and a side (front/back)
- **Requests**: each pair can open requests, attach documents, mark formal/unformal
- **Notes / transcription**: per pair, a transcriber writes the official notes
- **Role-based dashboards**
  - **ADMIN**: create audits, create pairs, assign users, manage workflow
  - **REGULAR**: see only assigned audits/pairs and work inside them

---

## Repo Structure (high level)

src/
  app/                 # Next.js routes (App Router)
    page.tsx           # redirect to /login
    login/             # email login page + server action
    adminDashboard/    # admin dashboard
    userDashboard/     # regular dashboard
    audits/            # audits pages
  server/
    db.ts              # Prisma client
    lib/
      currentUser.ts   # cookie session + DB user loading helpers
    api/               # tRPC routers (from T3)
  trpc/                # tRPC client/server helpers
prisma/
  schema.prisma
  migrations/
docker-compose.yml

---

## Server vs Client Components
In Next.js App Router:
- Files in `src/app/**` are **Server Components by default**
- A file becomes a **Client Component** only if it starts with `"use client";`

Use Server Components for:
- Prisma / DB
- cookies / redirects
- role checks

Use Client Components for:
- UI state (search/filter)
- click handlers
- interactive UI

---

## Authentication (Option A — Email Only)
1. User enters email on `/login`
2. Server Action checks the DB (`User.email`)
3. If found → sets cookie `audit_user_email`
4. Redirect based on role:
   - `ADMIN` → `/adminDashboard`
   - `REGULAR` → `/userDashboard`

Cookie:
- `audit_user_email` (httpOnly)

---

## Prerequisites
- Node.js (LTS)
- pnpm
- Docker Desktop

---

## Environment Variables
Create `.env` in project root:

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/audits-tool"
REDIS_URL="redis://localhost:6379"

---

## Start Postgres + Redis (Docker)

docker compose up --build

---

## Prisma Setup

pnpm prisma migrate dev --name init
pnpm prisma generate

Prisma Studio:
pnpm prisma studio

---

## Create Users Manually (Option A)
In Prisma Studio, insert users into `User`:
- one `ADMIN` (e.g. admin@local)
- one `REGULAR` (e.g. user@local)

---

## Run the App (Local) + Services (Docker)

pnpm dev

Open:
- http://localhost:3000 → redirects to `/login`
- `/login` → enter an email that exists in DB

---

## Routing Notes (App Router)
Routes are defined by folder/file structure:
- `/login` → `src/app/login/page.tsx`
- `/adminDashboard` → `src/app/adminDashboard/page.tsx`
- `/adminDashboard/new` → `src/app/adminDashboard/new/page.tsx`

File must be named **`page.tsx`**.

---

## Troubleshooting
Login redirects back to `/login`:
- ensure cookie name is `user_email`
- check DevTools → Application → Cookies
- if you use middleware, temporarily disable to avoid loops

Prisma migrate auth failed (P1000):
- check `DATABASE_URL` matches docker-compose credentials/port
