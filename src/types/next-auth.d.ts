import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "USER";
      groups: string[];
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "USER";
    groups: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "ADMIN" | "USER";
    groups: string[];
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    image?: string;
  }
}
