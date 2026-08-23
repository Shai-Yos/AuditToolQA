import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_URL: z.string().url().optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    AUTH_TRUST_HOST: z.enum(["true", "false"]).optional(),
    DATABASE_URL: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AZURE_AD_CLIENT_ID: z.string(),
    AZURE_AD_CLIENT_SECRET: z.string(),
    AZURE_AD_TENANT_ID: z.string(),
    OUTLOOK_ORGANIZER_EMAIL: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    // Keep false until delegated Tasks.ReadWrite has been granted in Entra ID.
    PLANNER_SYNC_ENABLED: z.enum(["true", "false"]).optional(),
    // Planner synchronization is disabled until both values are configured.
    PLANNER_PLAN_ID: z.string().min(1).optional(),
    PLANNER_BUCKET_ID: z.string().min(1).optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
    AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
    AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
    OUTLOOK_ORGANIZER_EMAIL: process.env.OUTLOOK_ORGANIZER_EMAIL,
    CRON_SECRET: process.env.CRON_SECRET,
    PLANNER_SYNC_ENABLED: process.env.PLANNER_SYNC_ENABLED,
    PLANNER_PLAN_ID: process.env.PLANNER_PLAN_ID,
    PLANNER_BUCKET_ID: process.env.PLANNER_BUCKET_ID,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
