import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { ensureBibiFriendshipForUser, getBibiOfficialProfile, getOrCreateBibiDirectRoom } from "../lib/officialAccounts";
import { roomWithMeta } from "./rooms";

const router: IRouter = Router();

router.get("/official-accounts/bibi", requireAuth, async (req, res): Promise<void> => {
  await ensureBibiFriendshipForUser(req.dbUser!.id);
  res.json(await getBibiOfficialProfile());
});

router.post("/official-accounts/bibi/room", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const roomId = await getOrCreateBibiDirectRoom(userId);
  const room = await roomWithMeta(roomId, userId);
  res.status(201).json({ account: await getBibiOfficialProfile(), room });
});

export default router;
