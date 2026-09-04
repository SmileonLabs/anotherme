import { and, eq, inArray, sql } from "drizzle-orm";
import {
  avatarCatalogItemsTable,
  characterAvatarLoadoutsTable,
  characterProfileInventoryTable,
  characterProfilesTable,
  db,
  fanCharacterProfilesTable,
  type AvatarCatalogItem,
  type CharacterAvatarLoadout,
  type CharacterProfile,
} from "@workspace/db";
import { spendPvtInTransaction } from "./pvt";

export const AVATAR_RECIPE_PREFIX = "anotherme-avatar:v1:";
export type AvatarSlot = AvatarCatalogItem["slot"];
export type AvatarGender = "man" | "woman";

type CatalogSeed = Omit<AvatarCatalogItem, "createdAt" | "updatedAt">;

function seed(
  itemKey: string,
  avatarType: "fan" | "star",
  slot: AvatarSlot,
  displayName: string,
  assetPath: string,
  options: Partial<CatalogSeed> = {},
): CatalogSeed {
  return {
    itemKey,
    avatarType,
    collectionKey: null,
    gender: null,
    slot,
    classStage: 0,
    jobKey: null,
    displayName,
    assetPath,
    layerOrder: 0,
    priceStarPoint: 0,
    purchasable: false,
    isDefault: false,
    status: "published",
    metadata: {},
    ...options,
  };
}

const FAN_SEEDS: CatalogSeed[] = [
  seed("fan.background.001", "fan", "background", "보랏빛 무대", "02_fan/00_back/back_001.png", { layerOrder: 0, isDefault: true }),
  ...(["man", "woman"] as const).flatMap((gender) => [1, 2].map((variant) =>
    seed(`fan.base.${gender}.${String(variant).padStart(3, "0")}`, "fan", "base", `${gender === "man" ? "남성" : "여성"} 베이스 ${variant}`, `02_fan/01_base/${gender === "man" ? "01_man" : "02_woman"}/body_00${variant}.png`, {
      gender, layerOrder: 10, isDefault: variant === 1,
    }),
  )),
  ...(["man", "woman"] as const).flatMap((gender) => Array.from({ length: gender === "man" ? 6 : 5 }, (_, index) => {
    const variant = index + 1;
    const filename = gender === "man" ? `hair${String(variant).padStart(3, "0")}.png` : `hair_${String(variant).padStart(3, "0")}.png`;
    return seed(`fan.head.${gender}.${String(variant).padStart(3, "0")}`, "fan", "head", `헤어 ${variant}`, `02_fan/02_slots/02_head/${gender}/${filename}`, {
      gender, layerOrder: 20, priceStarPoint: variant === 1 ? 0 : 500, purchasable: variant !== 1, isDefault: variant === 1,
    });
  })),
  ...(["man", "woman"] as const).flatMap((gender) => Array.from({ length: 6 }, (_, index) => {
    const variant = index + 1;
    return seed(`fan.wear.${gender}.${String(variant).padStart(3, "0")}`, "fan", "wear", `의상 ${variant}`, `02_fan/02_slots/03_wear/${gender}/wear_${String(variant).padStart(3, "0")}.png`, {
      gender, layerOrder: 30, priceStarPoint: variant === 1 ? 0 : 500, purchasable: variant !== 1, isDefault: variant === 1,
    });
  })),
  ...(["inssa", "sasang", "warm", "manager"] as const).map((jobKey, index) =>
    seed(`fan.effect.${jobKey}`, "fan", "effect", ["인싸", "사상가", "따뜻한 팬", "매니저"][index]!, `02_fan/03_classeffects/class2/0${index + 1}_${jobKey}.png`, {
      classStage: 2, jobKey, layerOrder: 40,
    }),
  ),
  ...(["man", "woman"] as const).flatMap((gender) => (["bard", "enchanter", "healer", "herald"] as const).map((jobKey, index) =>
    seed(`fan.full_skin.${gender}.${jobKey}`, "fan", "full_skin", ["음유시인", "인챈터", "힐러", "전령"][index]!, `02_fan/03_classeffects/class3_slotlock/${gender === "man" ? "01_manskin" : "02_womanskin"}/0${index + 1}_${jobKey}.png`, {
      gender, classStage: 3, jobKey, layerOrder: 35,
    }),
  )),
];

const STAR_CLASS2 = ["worker", "artisan", "hunter", "soldier"] as const;
const STAR_CLASS3 = ["farmer", "miner", "blacksmith", "golemancer", "archer", "ranger", "knight", "royalguard"] as const;
const STAR_SEEDS: CatalogSeed[] = [
  seed("star.teddy.background.001", "star", "background", "테디 무대", "01_star/00_back/back_001.webp", { collectionKey: "teddy", layerOrder: 0, isDefault: true }),
  seed("star.teddy.class0.baby", "star", "star_form", "베이비 테디", "01_star/01_teddy/00_class0/01_babyteddy.png", { collectionKey: "teddy", classStage: 0, layerOrder: 10, isDefault: true }),
  ...Array.from({ length: 5 }, (_, index) => seed(`star.teddy.class1.common.${String(index + 1).padStart(3, "0")}`, "star", "star_form", `평민 테디 ${index + 1}`, `01_star/01_teddy/01_class1/common_${String(index + 1).padStart(3, "0")}.png`, {
    collectionKey: "teddy", classStage: 1, layerOrder: 10,
  })),
  ...STAR_CLASS2.map((jobKey, index) => seed(`star.teddy.class2.${jobKey}`, "star", "star_form", jobKey, `01_star/01_teddy/02_class2/0${index + 1}_${jobKey}.png`, {
    collectionKey: "teddy", classStage: 2, jobKey, layerOrder: 10,
  })),
  ...STAR_CLASS3.map((jobKey, index) => seed(`star.teddy.class3.${jobKey}`, "star", "star_form", jobKey, `01_star/01_teddy/03_class3/0${index + 1}_${jobKey}.png`, {
    collectionKey: "teddy", classStage: 3, jobKey, layerOrder: 10,
  })),
  seed("star.teddy.effect.001", "star", "effect", "테디 성장 이펙트", "01_star/01_teddy/04_effect/001_effect.png", { collectionKey: "teddy", classStage: 1, layerOrder: 40 }),
];

export const AVATAR_CATALOG: readonly CatalogSeed[] = [...FAN_SEEDS, ...STAR_SEEDS];
const CATALOG_BY_KEY = new Map(AVATAR_CATALOG.map((item) => [item.itemKey, item]));
let catalogSync: Promise<void> | null = null;

export interface AvatarAppearanceView {
  profileId: string;
  type: "fan" | "star";
  gender: AvatarGender | null;
  classStage: number;
  recipe: string;
  layers: Array<CatalogSeed & { owned: true; equipped: true }>;
  loadout: CharacterAvatarLoadout;
}

function syncCatalog(): Promise<void> {
  if (catalogSync) return catalogSync;
  catalogSync = (async () => {
    for (const item of AVATAR_CATALOG) {
      await db.insert(avatarCatalogItemsTable).values(item).onConflictDoUpdate({
        target: avatarCatalogItemsTable.itemKey,
        set: {
          avatarType: item.avatarType,
          collectionKey: item.collectionKey,
          gender: item.gender,
          slot: item.slot,
          classStage: item.classStage,
          jobKey: item.jobKey,
          displayName: item.displayName,
          assetPath: item.assetPath,
          layerOrder: item.layerOrder,
          priceStarPoint: item.priceStarPoint,
          purchasable: item.purchasable,
          isDefault: item.isDefault,
          status: item.status,
          metadata: item.metadata,
          updatedAt: new Date(),
        },
      });
    }
  })().catch((error) => {
    catalogSync = null;
    throw error;
  });
  return catalogSync;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}

function fanGender(customization: Record<string, unknown>): AvatarGender {
  const value = String(customization.gender ?? customization.genderExpression ?? "").toLowerCase();
  if (value === "man" || value.includes("남")) return "man";
  return "woman";
}

function customizationKey(customization: Record<string, unknown>, key: string): string | null {
  const value = customization[key];
  return typeof value === "string" && CATALOG_BY_KEY.has(value) ? value : null;
}

function oldHairVariant(value: unknown): number {
  const labels = ["몽글", "웨이브", "숏", "내추럴"];
  const index = labels.indexOf(String(value));
  return index < 0 ? 1 : index + 1;
}

export function normalizeFanAvatarCustomization(input: Record<string, unknown>): Record<string, unknown> {
  const gender = fanGender(input);
  const valid = (value: unknown, slot: AvatarSlot) => {
    const item = typeof value === "string" ? CATALOG_BY_KEY.get(value) : null;
    return item?.avatarType === "fan" && item.slot === slot && (!item.gender || item.gender === gender) ? item.itemKey : null;
  };
  const hairVariant = Math.min(gender === "man" ? 6 : 5, oldHairVariant(input.hairStyle));
  return {
    ...input,
    gender,
    baseKey: valid(input.baseKey, "base") ?? `fan.base.${gender}.001`,
    headKey: valid(input.headKey, "head") ?? `fan.head.${gender}.${String(hairVariant).padStart(3, "0")}`,
    wearKey: valid(input.wearKey, "wear") ?? `fan.wear.${gender}.001`,
  };
}

/**
 * Persists the free starting look selected while a FAN is created. This also
 * replaces a legacy/default loadout that may have been initialized before the
 * onboarding form was submitted.
 */
export async function initializeFanAvatarLoadout(
  profileId: string,
  input: Record<string, unknown>,
): Promise<AvatarAppearanceView | null> {
  await syncCatalog();
  const customization = normalizeFanAvatarCustomization(input);
  const gender = fanGender(customization);
  const baseKey = customizationKey(customization, "baseKey") ?? `fan.base.${gender}.001`;
  const headKey = customizationKey(customization, "headKey") ?? `fan.head.${gender}.001`;
  const wearKey = customizationKey(customization, "wearKey") ?? `fan.wear.${gender}.001`;
  await db.transaction(async (tx) => {
    await tx.insert(characterAvatarLoadoutsTable).values({
      profileId,
      backgroundKey: "fan.background.001",
      baseKey,
      headKey,
      wearKey,
      effectKey: null,
      fullSkinKey: null,
      starFormKey: null,
    }).onConflictDoUpdate({
      target: characterAvatarLoadoutsTable.profileId,
      set: {
        backgroundKey: "fan.background.001",
        baseKey,
        headKey,
        wearKey,
        effectKey: null,
        fullSkinKey: null,
        starFormKey: null,
        version: sql`${characterAvatarLoadoutsTable.version} + 1`,
        updatedAt: new Date(),
      },
    });
    for (const itemKey of [baseKey, headKey, wearKey]) {
      await tx.insert(characterProfileInventoryTable).values({
        profileId,
        itemKey,
        itemType: "avatar",
        quantity: 1,
        equipped: true,
        metadata: { grantedAtCreation: true },
      }).onConflictDoUpdate({
        target: [characterProfileInventoryTable.profileId, characterProfileInventoryTable.itemKey],
        set: { quantity: 1, equipped: true, updatedAt: new Date() },
      });
    }
  });
  return getCharacterAvatarAppearance(profileId);
}

function isTeddyProfile(profile: CharacterProfile): boolean {
  const collection = String(profile.metadata?.avatarCollectionKey ?? "").toLowerCase();
  return collection === "teddy"
    || String(profile.metadata?.starKey ?? "").toLowerCase().includes("teddy")
    || String(profile.metadata?.category ?? "").toLowerCase().includes("teddy")
    || profile.displayName.toLowerCase().includes("teddy")
    || profile.displayName.includes("테디");
}

function teddyStage(level: number): number {
  if (level >= 60) return 3;
  if (level >= 30) return 2;
  if (level >= 10) return 1;
  return 0;
}

function teddyForm(profile: CharacterProfile, current?: string | null): string {
  const stage = teddyStage(profile.level);
  if (stage === 0) return "star.teddy.class0.baby";
  if (stage === 1) {
    if (current?.startsWith("star.teddy.class1.")) return current;
    return `star.teddy.class1.common.${String(hash(profile.id) % 5 + 1).padStart(3, "0")}`;
  }
  const class2Index = hash(`${profile.id}:class2`) % STAR_CLASS2.length;
  if (stage === 2) return `star.teddy.class2.${STAR_CLASS2[class2Index]}`;
  const class3Index = class2Index * 2 + (hash(`${profile.id}:class3`) % 2);
  return `star.teddy.class3.${STAR_CLASS3[class3Index]}`;
}

function visibleKeys(profile: CharacterProfile, loadout: CharacterAvatarLoadout): string[] {
  if (profile.type === "star") {
    return [loadout.backgroundKey, loadout.starFormKey, teddyStage(profile.level) >= 1 ? loadout.effectKey : null].filter((key): key is string => !!key);
  }
  const stage = Math.max(0, profile.jobStage ?? 0);
  return stage >= 3 && loadout.fullSkinKey
    ? [loadout.backgroundKey, loadout.baseKey, loadout.fullSkinKey].filter((key): key is string => !!key)
    : [loadout.backgroundKey, loadout.baseKey, loadout.headKey, loadout.wearKey, stage >= 2 ? loadout.effectKey : null].filter((key): key is string => !!key);
}

export function buildAvatarRecipe(type: "fan" | "star", keys: string[]): string {
  return `${AVATAR_RECIPE_PREFIX}${type}:${keys.join(",")}`;
}

async function ensureProfileLoadout(profile: CharacterProfile): Promise<CharacterAvatarLoadout | null> {
  if (profile.type !== "fan" && (profile.type !== "star" || !isTeddyProfile(profile))) return null;
  await syncCatalog();
  let [loadout] = await db.select().from(characterAvatarLoadoutsTable)
    .where(eq(characterAvatarLoadoutsTable.profileId, profile.id)).limit(1);

  if (!loadout) {
    if (profile.type === "fan") {
      const [fan] = await db.select().from(fanCharacterProfilesTable)
        .where(eq(fanCharacterProfilesTable.profileId, profile.id)).limit(1);
      const customization = normalizeFanAvatarCustomization(fan?.customization ?? {});
      const gender = fanGender(customization);
      const baseKey = customizationKey(customization, "baseKey") ?? `fan.base.${gender}.001`;
      const requestedHead = customizationKey(customization, "headKey");
      const oldVariant = oldHairVariant(customization.hairStyle);
      const maxHair = gender === "man" ? 6 : 5;
      const headKey = requestedHead ?? `fan.head.${gender}.${String(Math.min(maxHair, oldVariant)).padStart(3, "0")}`;
      const wearKey = customizationKey(customization, "wearKey") ?? `fan.wear.${gender}.001`;
      [loadout] = await db.insert(characterAvatarLoadoutsTable).values({
        profileId: profile.id,
        backgroundKey: "fan.background.001",
        baseKey,
        headKey,
        wearKey,
      }).onConflictDoNothing().returning();
      for (const itemKey of [baseKey, headKey, wearKey]) {
        await db.insert(characterProfileInventoryTable).values({ profileId: profile.id, itemKey, itemType: "avatar", quantity: 1, equipped: true })
          .onConflictDoUpdate({ target: [characterProfileInventoryTable.profileId, characterProfileInventoryTable.itemKey], set: { quantity: 1, equipped: true, updatedAt: new Date() } });
      }
    } else {
      [loadout] = await db.insert(characterAvatarLoadoutsTable).values({
        profileId: profile.id,
        backgroundKey: "star.teddy.background.001",
        starFormKey: teddyForm(profile),
        effectKey: "star.teddy.effect.001",
      }).onConflictDoNothing().returning();
    }
    if (!loadout) [loadout] = await db.select().from(characterAvatarLoadoutsTable).where(eq(characterAvatarLoadoutsTable.profileId, profile.id)).limit(1);
  }
  if (!loadout) return null;

  const updates: Partial<typeof characterAvatarLoadoutsTable.$inferInsert> = {};
  if (profile.type === "star") {
    const form = teddyForm(profile, loadout.starFormKey);
    if (form !== loadout.starFormKey) updates.starFormKey = form;
  } else if (profile.jobStage >= 3 && !loadout.fullSkinKey) {
    const base = CATALOG_BY_KEY.get(loadout.baseKey ?? "");
    const gender = base?.gender ?? "woman";
    const job = ["bard", "enchanter", "healer", "herald"].includes(profile.jobKey ?? "") ? profile.jobKey! : "bard";
    updates.fullSkinKey = `fan.full_skin.${gender}.${job}`;
  } else if (profile.jobStage >= 2 && !loadout.effectKey) {
    const job = ["inssa", "sasang", "warm", "manager"].includes(profile.jobKey ?? "") ? profile.jobKey! : "inssa";
    updates.effectKey = `fan.effect.${job}`;
  }
  if (Object.keys(updates).length) {
    [loadout] = await db.update(characterAvatarLoadoutsTable).set({ ...updates, version: loadout.version + 1, updatedAt: new Date() })
      .where(eq(characterAvatarLoadoutsTable.profileId, profile.id)).returning();
  }
  return loadout ?? null;
}

export async function getCharacterAvatarAppearance(profileId: string): Promise<AvatarAppearanceView | null> {
  const [profile] = await db.select().from(characterProfilesTable).where(eq(characterProfilesTable.id, profileId)).limit(1);
  if (!profile || (profile.type !== "fan" && profile.type !== "star")) return null;
  const loadout = await ensureProfileLoadout(profile);
  if (!loadout) return null;
  const keys = visibleKeys(profile, loadout);
  const layers = keys.map((key) => CATALOG_BY_KEY.get(key)).filter((item): item is CatalogSeed => !!item)
    .sort((a, b) => a.layerOrder - b.layerOrder)
    .map((item) => ({ ...item, owned: true as const, equipped: true as const }));
  const recipe = buildAvatarRecipe(profile.type, layers.map((item) => item.itemKey));
  if (profile.profileImageUrl !== recipe) {
    await db.update(characterProfilesTable).set({ profileImageUrl: recipe, updatedAt: new Date() }).where(eq(characterProfilesTable.id, profile.id));
  }
  const base = CATALOG_BY_KEY.get(loadout.baseKey ?? "");
  return { profileId, type: profile.type, gender: base?.gender ?? null, classStage: profile.type === "star" ? teddyStage(profile.level) : profile.jobStage, recipe, layers, loadout };
}

export async function ensureUserAvatarProfiles(userId: string): Promise<void> {
  const profiles = await db.select({ id: characterProfilesTable.id }).from(characterProfilesTable)
    .where(and(eq(characterProfilesTable.ownerUserId, userId), inArray(characterProfilesTable.type, ["fan", "star"])));
  await Promise.all(profiles.map((profile) => getCharacterAvatarAppearance(profile.id)));
}

export async function listAvatarCatalog(profileId: string) {
  await syncCatalog();
  const appearance = await getCharacterAvatarAppearance(profileId);
  if (!appearance) return null;
  const inventory = await db.select().from(characterProfileInventoryTable).where(eq(characterProfileInventoryTable.profileId, profileId));
  const owned = new Set(inventory.filter((item) => item.quantity > 0).map((item) => item.itemKey));
  const equipped = new Set(visibleKeys(await getProfile(profileId), appearance.loadout));
  return {
    appearance,
    items: AVATAR_CATALOG.filter((item) => item.avatarType === appearance.type).map((item) => ({ ...item, owned: owned.has(item.itemKey) || item.isDefault, equipped: equipped.has(item.itemKey) })),
  };
}

async function getProfile(profileId: string): Promise<CharacterProfile> {
  const [profile] = await db.select().from(characterProfilesTable).where(eq(characterProfilesTable.id, profileId)).limit(1);
  if (!profile) throw avatarError("PROFILE_NOT_FOUND");
  return profile;
}

function avatarError(code: string): Error {
  const error = new Error(code);
  (error as Error & { code?: string }).code = code;
  return error;
}

async function ownedItem(profileId: string, itemKey: string): Promise<boolean> {
  const [row] = await db.select({ quantity: characterProfileInventoryTable.quantity }).from(characterProfileInventoryTable)
    .where(and(eq(characterProfileInventoryTable.profileId, profileId), eq(characterProfileInventoryTable.itemKey, itemKey))).limit(1);
  return (row?.quantity ?? 0) > 0;
}

export async function purchaseAvatarItem(userId: string, profileId: string, itemKey: string) {
  await syncCatalog();
  const profile = await getProfile(profileId);
  if (profile.ownerUserId !== userId) throw avatarError("PROFILE_NOT_OWNED");
  const item = CATALOG_BY_KEY.get(itemKey);
  if (!item || item.status !== "published" || item.avatarType !== profile.type) throw avatarError("AVATAR_ITEM_NOT_FOUND");
  if (!item.purchasable) throw avatarError("AVATAR_ITEM_NOT_PURCHASABLE");
  await db.transaction(async (tx) => {
    await spendPvtInTransaction(tx, {
      userId,
      amount: item.priceStarPoint,
      source: "AVATAR_ITEM",
      sourceId: `avatar-item:${profileId}:${itemKey}`,
      description: `아바타 아이템 구매 · ${item.displayName}`,
    });
    await tx.insert(characterProfileInventoryTable).values({
      profileId,
      itemKey,
      itemType: "avatar",
      quantity: 1,
      equipped: false,
      metadata: { purchasedWith: "STAR_POINT", price: item.priceStarPoint },
    }).onConflictDoUpdate({
      target: [characterProfileInventoryTable.profileId, characterProfileInventoryTable.itemKey],
      set: { quantity: 1, metadata: { purchasedWith: "STAR_POINT", price: item.priceStarPoint }, updatedAt: new Date() },
    });
  });
  return listAvatarCatalog(profileId);
}

export async function equipAvatarItem(userId: string, profileId: string, itemKey: string) {
  await syncCatalog();
  const profile = await getProfile(profileId);
  if (profile.ownerUserId !== userId) throw avatarError("PROFILE_NOT_OWNED");
  const item = CATALOG_BY_KEY.get(itemKey);
  if (!item || item.status !== "published" || item.avatarType !== profile.type) throw avatarError("AVATAR_ITEM_NOT_FOUND");
  const appearance = await getCharacterAvatarAppearance(profileId);
  if (!appearance) throw avatarError("AVATAR_NOT_AVAILABLE");
  if (!item.isDefault && item.priceStarPoint > 0 && !(await ownedItem(profileId, itemKey))) throw avatarError("AVATAR_ITEM_NOT_OWNED");
  if (item.classStage > appearance.classStage) throw avatarError("AVATAR_ITEM_LOCKED");
  if (item.gender && appearance.gender && item.slot !== "base" && item.gender !== appearance.gender) throw avatarError("AVATAR_ITEM_GENDER_MISMATCH");

  const columnBySlot = {
    background: "backgroundKey",
    base: "baseKey",
    head: "headKey",
    wear: "wearKey",
    effect: "effectKey",
    full_skin: "fullSkinKey",
    star_form: "starFormKey",
  } as const;
  const column = columnBySlot[item.slot];
  await db.transaction(async (tx) => {
    const update: Record<string, unknown> = { [column]: itemKey, version: appearance.loadout.version + 1, updatedAt: new Date() };
    if (item.slot === "base" && item.gender && item.gender !== appearance.gender) {
      update.headKey = `fan.head.${item.gender}.001`;
      update.wearKey = `fan.wear.${item.gender}.001`;
      update.fullSkinKey = null;
      for (const key of [update.headKey, update.wearKey]) {
        await tx.insert(characterProfileInventoryTable).values({ profileId, itemKey: String(key), itemType: "avatar", quantity: 1, equipped: true })
          .onConflictDoUpdate({ target: [characterProfileInventoryTable.profileId, characterProfileInventoryTable.itemKey], set: { quantity: 1, equipped: true, updatedAt: new Date() } });
      }
    }
    await tx.update(characterAvatarLoadoutsTable).set(update).where(eq(characterAvatarLoadoutsTable.profileId, profileId));
    await tx.update(characterProfileInventoryTable).set({ equipped: false, updatedAt: new Date() }).where(eq(characterProfileInventoryTable.profileId, profileId));
    await tx.insert(characterProfileInventoryTable).values({ profileId, itemKey, itemType: "avatar", quantity: 1, equipped: true })
      .onConflictDoUpdate({ target: [characterProfileInventoryTable.profileId, characterProfileInventoryTable.itemKey], set: { quantity: 1, equipped: true, updatedAt: new Date() } });
  });
  return listAvatarCatalog(profileId);
}
