import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "AUDIT_OWNER" | "USER";
      groups: string[];
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "AUDIT_OWNER" | "USER";
    groups: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "ADMIN" | "AUDIT_OWNER" | "USER";
    groups: string[];
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    image?: string;
  }
}
