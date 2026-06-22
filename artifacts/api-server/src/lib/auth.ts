import { getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import { logger } from "./logger";

declare global {
  namespace Express {
    interface Request {
      clerkUserId?: string;
      dbUser?: User;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const clerkUserId = auth.userId;
  req.clerkUserId = clerkUserId;

  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkUserId));

  if (!user) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
      const nickname =
        clerkUser.firstName ??
        clerkUser.username ??
        email.split("@")[0] ??
        "User";
      [user] = await db
        .insert(usersTable)
        .values({ clerkId: clerkUserId, email, nickname })
        .returning();
    } catch (err) {
      logger.error({ err }, "Failed to provision user");
      res.status(500).json({ error: "Failed to provision user" });
      return;
    }
  }

  req.dbUser = user;
  next();
}
