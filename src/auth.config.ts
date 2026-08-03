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

  if (!authUrl && !nextAuthUrl) {
    throw new Error("Missing auth base URL: set AUTH_URL or NEXTAUTH_URL in production.");
  }

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
  "8c601df7-9839-4423-8ccc-03339bb5c6cb",
];
const AUDIT_OWNER_GROUP = "8a7394c6-0e1d-444f-89a0-5e810ac4be89";
const USER_GROUPS = ["e4ae5d7c-bf12-4d28-97d4-32a7d5d3a169", "053a3898-0943-415c-b6d4-fc02692be583"];

function resolveRole(groups: string[]): "ADMIN" | "AUDIT_OWNER" | "USER" {
  if (ADMIN_GROUPS.some((g) => groups.includes(g))) return "ADMIN";
  if (groups.includes(AUDIT_OWNER_GROUP)) return "AUDIT_OWNER";
  if (USER_GROUPS.some((g) => groups.includes(g))) return "USER";
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
        params: { scope: "openid profile email User.Read" },
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, account, profile }) => {
      if (account && profile) {
        const groups: string[] = (profile as Record<string, unknown>).groups as string[] ?? [];
        token.role = resolveRole(groups);
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
