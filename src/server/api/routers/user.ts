import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { searchUsers, getUserPhoto } from "@/server/lib/graphClient";

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

          // For users not yet in the DB, fetch their photo directly from Graph.
          const missingIds = ids.filter((id) => !photoMap.get(id));
          const graphPhotos = await Promise.all(
            missingIds.map(async (id) => [id, await getUserPhoto(id).catch(() => null)] as const)
          );
          for (const [id, photo] of graphPhotos) {
            if (photo) photoMap.set(id, photo);
          }

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
    resolveUserImage: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const user = await db.user.findUnique({
          where: { id: input.id },
          select: { image: true },
        });
        if (user?.image) return { image: user.image };

        // No photo cached locally yet — fetch from Graph and persist for next time.
        const photo = await getUserPhoto(input.id).catch(() => null);
        if (photo) {
          await db.user
            .update({ where: { id: input.id }, data: { image: photo } })
            .catch(() => {
              // User may not exist in the DB yet (e.g. mid add-member flow) — ignore.
            });
        }
        return { image: photo };
      }),
});