import AzureAD from "next-auth/providers/azure-ad";
import type { NextAuthConfig } from "next-auth";
import { env } from "@/env";

function normalizeUrlOrigin(value: string): string {
  const parsed = new URL(value);
  return parsed.origin.toLowerCase();
}

if (process.env.NODE_ENV === "production") {
  const authUrl = process.env.AUTH_URL;
  const nextAuthUrl = process.env.NEXTAUTH_URL;

  if (authUrl && nextAuthUrl) {
    const authOrigin = normalizeUrlOrigin(authUrl);
    const nextAuthOrigin = normalizeUrlOrigin(nextAuthUrl);
    if (authOrigin !== nextAuthOrigin) {
      throw new Error(
        `AUTH_URL (${authOrigin}) and NEXTAUTH_URL (${nextAuthOrigin}) must match in production.`,
      );
    }
  }
}

const ADMIN_GROUPS = [
  "8c601df7-9839-4423-8ccc-03339bb5c6cb", // Admin
  "80e58a83-b7ae-4ca1-a583-d462add96e9b", // Operator
];

// App roles (used when the app uses role-based claims instead of group claims)
const ADMIN_ROLES = ["Admin", "Operator"];

const plannerConfigured = Boolean(env.PLANNER_PLAN_ID?.trim()) && Boolean(env.PLANNER_BUCKET_ID?.trim());

function resolveRole(groups: string[], roles: string[] = []): "ADMIN" | "AUDIT_OWNER" | "USER" {
  if (ADMIN_ROLES.some((r) => roles.includes(r))) return "ADMIN";
  if (ADMIN_GROUPS.some((g) => groups.includes(g))) return "ADMIN";
  return "USER";
}

export const authConfig = {
  trustHost: true,
  providers: [
    AzureAD({
      clientId: env.AZURE_AD_CLIENT_ID,
      clientSecret: env.AZURE_AD_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/v2.0`,
      authorization: {
        // offline_access lets server-side integrations refresh the delegated Graph
        // token without exposing it to the browser.
        // Do not request Tasks.ReadWrite until it has been granted in Entra ID;
        // otherwise Azure sign-in would fail before the permission is available.
        params: {
          scope: `openid profile email offline_access User.Read${plannerConfigured ? " Tasks.ReadWrite" : ""}`,
        },
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, account, profile }) => {
      if (account && profile) {
        const groups: string[] = (profile as Record<string, unknown>).groups as string[] ?? [];
        const roles: string[] = (profile as Record<string, unknown>).roles as string[] ?? [];
        token.role = resolveRole(groups, roles);
        // Store the Azure Object ID (OID) as token.sub so session.user.id = OID everywhere.
        // Azure AD v2.0 `sub` is a pairwise pseudonymous id (app-specific) and differs
        // from the OID returned by Graph API. Using OID makes all lookups consistent.
        const oid = (profile as Record<string, unknown>).oid as string | undefined;
        if (oid) token.sub = oid;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (token) {
        session.user.id = token.sub!;
        session.user.role = token.role as "ADMIN" | "AUDIT_OWNER" | "USER";
        session.user.image = "/api/user/photo";
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 }, // 1 day
} satisfies NextAuthConfig;
