import NextAuth from "next-auth";
import { db } from "@/server/db";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    signIn: async ({ user, account, profile }) => {
      // Ensure user exists in DB with correct role
      const groups: string[] = (profile as Record<string, unknown>).groups as string[] ?? [];
      let role: "ADMIN" | "AUDIT_OWNER" | "USER" = "USER";
      if (groups.includes("8c601df7-9839-4423-8ccc-03339bb5c6cb")) {
        role = "ADMIN";
      } else if (groups.includes("8a7394c6-0e1d-444f-89a0-5e810ac4be89")) {
        role = "AUDIT_OWNER";
      } else if (groups.includes("e4ae5d7c-bf12-4d28-97d4-32a7d5d3a169") || groups.includes("053a3898-0943-415c-b6d4-fc02692be583")) {
        role = "USER";
      } else {
        // Not in any group, deny access
        return false;
      }

      // Try to fetch the user's photo from Microsoft Graph
      let imageDataUrl: string | undefined;
      if (account?.access_token) {
        try {
          const photoRes = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
            headers: { Authorization: `Bearer ${account.access_token}` },
          });
          if (photoRes.ok) {
            const buffer = await photoRes.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const contentType = photoRes.headers.get("content-type") ?? "image/jpeg";
            imageDataUrl = `data:${contentType};base64,${base64}`;
          }
        } catch {
          // Photo fetch is non-critical, ignore errors
        }
      }

      // Use the Azure Object ID (OID) as the canonical DB id — it matches what
      // Graph API returns and what session.user.id is set to in auth.config.ts.
      // user.id from NextAuth is the pairwise sub (app-specific, not the OID).
      const azureId = ((profile as Record<string, unknown>).oid as string | undefined) ?? user.id!;
      // Build a redirect URL that prefills the request-access form when a
      // user is blocked. `signIn` returning a URL aborts sign-in (no session
      // is created), so we must pass identity via query params.
      const prefillQuery = new URLSearchParams({
        email: user.email ?? "",
        name: user.name ?? "",
      }).toString();
      const requestAccessUrl = `/request-access?${prefillQuery}`;

      const placeholder = await db.user.findUnique({ where: { id: azureId } });
      if (placeholder) {
        // Block inactive users from signing in
        if (!placeholder.isActive) {
          return requestAccessUrl;
        }
        // User already exists — preserve their DB role (an admin may have changed it).
        // Only update non-role fields.
        try {
          await db.user.update({
            where: { id: azureId },
            data: {
              name: user.name,
              email: user.email!,
              ...(imageDataUrl ? { image: imageDataUrl } : {}),
            },
          });
        } catch {
          // email conflict with another record — update everything except email and role
          await db.user.update({
            where: { id: azureId },
            data: { name: user.name, ...(imageDataUrl ? { image: imageDataUrl } : {}) },
          });
        }
      } else {
        // No record with this Azure OID yet — upsert by email.
        // For new records use the Azure-derived role; for existing email records preserve their role.
        const existingByEmail = await db.user.findUnique({ where: { email: user.email! } });
        // Block inactive users found by email
        if (existingByEmail && !existingByEmail.isActive) {
          return requestAccessUrl;
        }
        await db.user.upsert({
          where: { email: user.email! },
          update: {
            id: azureId,
            name: user.name,
            // Preserve existing role if record already exists; use Azure-derived role for new records
            ...(existingByEmail ? {} : { role }),
            ...(imageDataUrl ? { image: imageDataUrl } : {}),
          },
          create: {
            id: azureId,
            email: user.email!,
            name: user.name,
            role,
            image: imageDataUrl ?? null,
          },
        });
      }

      return true;
    },
    jwt: async ({ token, account, profile }) => {
      if (account && profile) {
        // Kept only in Auth.js's encrypted, HTTP-only JWT cookie. The token is
        // intentionally not copied to the client Session object.
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpiresAt = account.expires_at ? account.expires_at * 1000 : undefined;

        // Store Azure OID as token.sub so session.user.id = OID everywhere
        const oid = (profile as Record<string, unknown>).oid as string | undefined;
        if (oid) token.sub = oid;

        // Read role from DB — DB is the source of truth (admins change roles there).
        // Do NOT derive role from Azure group claims, which can lag by hours after a group change.
        const azureId = oid ?? token.sub;
        if (azureId) {
          try {
            const dbUser = await db.user.findUnique({
              where: { id: azureId },
              select: { role: true },
            });
            if (dbUser) token.role = dbUser.role;
          } catch {
            // DB unavailable — fall back to Azure group claims
            const groups: string[] = (profile as Record<string, unknown>).groups as string[] ?? [];
            const ADMIN = "8c601df7-9839-4423-8ccc-03339bb5c6cb";
            const AUDIT_OWNER = "8a7394c6-0e1d-444f-89a0-5e810ac4be89";
            token.role = groups.includes(ADMIN) ? "ADMIN" : groups.includes(AUDIT_OWNER) ? "AUDIT_OWNER" : "USER";
          }
        }
      }
      return token;
    },
  },
});
