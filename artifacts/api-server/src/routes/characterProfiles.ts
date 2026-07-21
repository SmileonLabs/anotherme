import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth";
import {
  activateCharacterProfile,
  ensureCharacterProfileState,
  updateCharacterProfile,
  getPublicCharacterProfile,
  setCharacterProfileFollowing,
} from "../lib/characterProfiles";
import { listPublicStarFeedPostsByAuthor } from "../lib/starFeed";

const router: IRouter = Router();
const activateSchema = z.object({ profileId: z.uuid() });
const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(30).optional(),
  profileImageUrl: z.string().max(1024).nullable().optional(),
  statusMessage: z.string().trim().max(100).nullable().optional(),
}).refine((body) => Object.keys(body).length > 0, { message: "At least one field is required" });

router.get("/users/me/profiles", requireAuth, async (req, res): Promise<void> => {
  res.json(await ensureCharacterProfileState(req.dbUser!.id));
});

router.patch("/users/me/active-profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid profileId is required" });
    return;
  }
  try {
    res.json(await activateCharacterProfile(req.dbUser!.id, parsed.data.profileId));
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "PROFILE_NOT_FOUND") {
      res.status(404).json({ error: code });
      return;
    }
    if (code === "PROFILE_UNAVAILABLE") {
      res.status(409).json({ error: code });
      return;
    }
    throw error;
  }
});

router.patch("/users/me/profiles/:profileId", requireAuth, async (req, res): Promise<void> => {
  const profileId = Array.isArray(req.params.profileId) ? req.params.profileId[0] : req.params.profileId;
  const parsedId = z.uuid().safeParse(profileId);
  const parsedBody = updateSchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    res.status(400).json({ error: "Invalid profile update" });
    return;
  }
  try {
    res.json(await updateCharacterProfile(req.dbUser!.id, parsedId.data, parsedBody.data));
  } catch (error) {
    if ((error as Error & { code?: string }).code === "PROFILE_NOT_FOUND") {
      res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      return;
    }
    throw error;
  }
});

router.get("/profiles/:profileId", requireAuth, async (req, res): Promise<void> => {
  const profileId = Array.isArray(req.params.profileId) ? req.params.profileId[0] : req.params.profileId;
  const parsedId = z.uuid().safeParse(profileId);
  if (!parsedId.success) {
    res.status(400).json({ error: "Invalid profile id" });
    return;
  }
  const profile = await getPublicCharacterProfile(req.dbUser!.id, parsedId.data);
  if (!profile) {
    res.status(404).json({ error: "PROFILE_NOT_FOUND" });
    return;
  }
  const posts = await listPublicStarFeedPostsByAuthor(req.dbUser!.id, profile.ownerUserId, 30, undefined, undefined, profile.id);
  const { ownerUserId: _ownerUserId, ...publicProfile } = profile;
  res.json({ profile: publicProfile, posts });
});

router.post("/profiles/:profileId/follow", requireAuth, async (req, res): Promise<void> => {
  const profileId = Array.isArray(req.params.profileId) ? req.params.profileId[0] : req.params.profileId;
  if (!z.uuid().safeParse(profileId).success) {
    res.status(400).json({ error: "Invalid profile id" });
    return;
  }
  try {
    const result = await setCharacterProfileFollowing(req.dbUser!.id, profileId, true);
    if (!result) { res.status(404).json({ error: "PROFILE_NOT_FOUND" }); return; }
    res.json(result);
  } catch (error) {
    if ((error as Error & { code?: string }).code === "OWN_PROFILE") { res.status(409).json({ error: "OWN_PROFILE" }); return; }
    throw error;
  }
});

router.delete("/profiles/:profileId/follow", requireAuth, async (req, res): Promise<void> => {
  const profileId = Array.isArray(req.params.profileId) ? req.params.profileId[0] : req.params.profileId;
  if (!z.uuid().safeParse(profileId).success) {
    res.status(400).json({ error: "Invalid profile id" });
    return;
  }
  try {
    const result = await setCharacterProfileFollowing(req.dbUser!.id, profileId, false);
    if (!result) { res.status(404).json({ error: "PROFILE_NOT_FOUND" }); return; }
    res.json(result);
  } catch (error) {
    if ((error as Error & { code?: string }).code === "OWN_PROFILE") { res.status(409).json({ error: "OWN_PROFILE" }); return; }
    throw error;
  }
});

export default router;
