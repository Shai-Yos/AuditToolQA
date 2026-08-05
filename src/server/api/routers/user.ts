import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { searchUsers } from "@/server/lib/graphClient";

export const userRouter = createTRPCRouter({
    searchDbUsers: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        const search = input.query.trim();
        if (search.length < 2) return [];

        // Search Azure AD directly so admins can assign any Philips employee
        try {
          const azureUsers = await searchUsers(search);
          const ids = azureUsers.map((u) => u.id);

          // Batch-fetch photos for users already in the DB (stored at sign-in).
          const dbPhotos = ids.length
            ? await db.user.findMany({
                where: { id: { in: ids } },
                select: { id: true, image: true },
              })
            : [];
          const photoMap = new Map(dbPhotos.map((u) => [u.id, u.image]));

          return azureUsers.map((u) => ({
            id: u.id,
            name: u.displayName,
            email: u.mail ?? u.userPrincipalName,
            image: photoMap.get(u.id) ?? null,
          }));
        } catch {
          // Fallback to DB search if Graph API fails
          const users = await db.user.findMany({
            where: {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } },
              ],
            },
            take: 20,
            select: { id: true, name: true, email: true, image: true },
          });
          return users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            image: u.image ?? null,
          }));
        }
      }),
    getUsersByIds: publicProcedure
      .input(z.object({ ids: z.array(z.string()) }))
      .query(async ({ input }) => {
        if (!input.ids || input.ids.length === 0) return [];
        const users = await db.user.findMany({
          where: { id: { in: input.ids } },
          select: { id: true, name: true, email: true, image: true },
        });
        return users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          image: u.image ?? null,
        }));
      }),
});