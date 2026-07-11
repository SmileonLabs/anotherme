import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth";
import {
  WalletVerificationError,
  createWalletChallenge,
  getWalletStatus,
  refreshWalletNft,
  verifyWalletChallenge,
} from "../lib/walletVerification";
import { StarProfileError, equipStarNft, getEquippedStarProfile } from "../lib/starProfiles";
import { ensurePlayModeState } from "../lib/fanStar";

const router: IRouter = Router();

const challengeBodySchema = z.object({
  walletAddress: z.string().trim().min(1).max(120),
});

const verifyBodySchema = z.object({
  walletAddress: z.string().trim().min(1).max(120),
  challengeId: z.string().trim().uuid(),
  signature: z.string().trim().min(1).max(500),
});

const equipBodySchema = z.object({
  tokenId: z.string().trim().min(1).max(80),
});

function handleWalletError(res: import("express").Response, err: unknown): boolean {
  if (!(err instanceof WalletVerificationError)) return false;
  const status =
    err.code === "invalid_wallet" || err.code === "invalid_signature"
      ? 400
      : err.code === "wallet_claimed"
        ? 409
        : err.code === "nft_check_failed"
          ? 502
          : 404;
  res.status(status).json({ error: err.code, message: err.message });
  return true;
}

function handleStarProfileError(res: import("express").Response, err: unknown): boolean {
  if (!(err instanceof StarProfileError)) return false;
  const status =
    err.code === "wallet_required"
      ? 409
      : err.code === "config_missing"
        ? 503
        : err.code === "token_not_owned"
          ? 403
          : err.code === "nft_check_failed"
            ? 502
            : 400;
  res.status(status).json({ error: err.code, message: err.message });
  return true;
}

router.get("/users/me/wallet", requireAuth, async (req, res): Promise<void> => {
  res.json(await getWalletStatus(req.dbUser!.id));
});

router.post("/users/me/wallet/challenge", requireAuth, async (req, res): Promise<void> => {
  const parsed = challengeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "지갑 주소를 입력해 주세요." });
    return;
  }

  try {
    res.status(201).json(
      await createWalletChallenge({
        userId: req.dbUser!.id,
        walletAddress: parsed.data.walletAddress,
      }),
    );
  } catch (err) {
    if (handleWalletError(res, err)) return;
    throw err;
  }
});

router.post("/users/me/wallet/verify", requireAuth, async (req, res): Promise<void> => {
  const parsed = verifyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "서명 정보를 확인해 주세요." });
    return;
  }

  try {
    res.json(
      await verifyWalletChallenge({
        userId: req.dbUser!.id,
        walletAddress: parsed.data.walletAddress,
        challengeId: parsed.data.challengeId,
        signature: parsed.data.signature,
      }),
    );
  } catch (err) {
    if (handleWalletError(res, err)) return;
    throw err;
  }
});

router.post("/users/me/wallet/refresh", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(await refreshWalletNft(req.dbUser!.id));
  } catch (err) {
    if (handleWalletError(res, err)) return;
    throw err;
  }
});

router.get("/users/me/star-profile", requireAuth, async (req, res): Promise<void> => {
  res.json({ equippedStar: await getEquippedStarProfile(req.dbUser!.id) });
});

router.post("/users/me/star-nft/equip", requireAuth, async (req, res): Promise<void> => {
  const parsed = equipBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "NFT 번호를 입력해 주세요." });
    return;
  }

  try {
    const equippedStar = await equipStarNft({ userId: req.dbUser!.id, tokenId: parsed.data.tokenId });
    res.json({ equippedStar, state: await ensurePlayModeState(req.dbUser!.id) });
  } catch (err) {
    if (handleStarProfileError(res, err)) return;
    throw err;
  }
});

export default router;
