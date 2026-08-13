import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { searchUsers, getUserPhotosBatch } from "@/server/lib/graphClient";

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
          // image: null = never checked, "" = checked & confirmed no photo, string = real photo.
          const dbRows = ids.length
            ? await db.user.findMany({
                where: { id: { in: ids } },
                select: { id: true, image: true },
              })
            : [];
          const dbMap = new Map(dbRows.map((u) => [u.id, u.image] as const));
          const photoMap = new Map<string, string | null>();
          for (const [id, image] of dbMap) photoMap.set(id, image || null);

          // Only hit Graph for users not yet in the DB, or DB rows never checked.
          // Bounded concurrency avoids tripping Graph throttling; ids that fail
          // transiently are simply omitted (left null) rather than mis-cached.
          const missingIds = ids.filter((id) => {
            const dbImage = dbMap.get(id);
            return dbImage === undefined || dbImage === null;
          });
          const graphPhotos = await getUserPhotosBatch(missingIds);
          for (const [id, photo] of graphPhotos) {
            if (photo) photoMap.set(id, photo);
          }

          // Cache the result (including "no photo" as "") for existing DB users
          // so future searches skip the Graph call for them entirely.
          await Promise.all(
            [...graphPhotos.entries()]
              .filter(([id]) => dbMap.has(id))
              .map(([id, photo]) => db.user.update({ where: { id }, data: { image: photo } }).catch(() => {}))
          );

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