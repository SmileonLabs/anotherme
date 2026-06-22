import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { requestUploadUrl } from "@workspace/api-client-react";
import { convertHeicIfNeeded } from "./convertHeic";

export interface UploadedImage {
  /** Canonical object path to persist in the message content (`/objects/<id>`). */
  objectPath: string;
  /** Local uri of the picked asset (useful for instant previews). */
  localUri: string;
}

export class PermissionDeniedError extends Error {
  constructor() {
    super("permission-denied");
    this.name = "PermissionDeniedError";
  }
}

/**
 * Upload a blob straight to object storage via a presigned URL and return the
 * canonical object path (`/objects/<id>`). Shared by the chat image flow and
 * the profile-image crop flow.
 */
export async function uploadBlob(
  blob: Blob,
  name = `image-${Date.now()}.jpg`,
): Promise<string> {
  const contentType = blob.type || "image/jpeg";
  const size = blob.size || 1;

  const { uploadURL, objectPath } = await requestUploadUrl({ name, size, contentType });

  const put = await fetch(uploadURL, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) throw new Error(`upload-failed-${put.status}`);

  return objectPath;
}

/**
 * Open the image library, upload the chosen image straight to object storage
 * via a presigned URL, and return the stored object path. Returns `null` when
 * the user cancels.
 */
export async function pickAndUploadImage(): Promise<UploadedImage | null> {
  if (Platform.OS !== "web") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new PermissionDeniedError();
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const rawBlob = await (await fetch(asset.uri)).blob();
  // iPhone photos are HEIC; convert to JPEG (web only) so every recipient can
  // see them. No-op for non-HEIC images and on native.
  const { blob, name, contentType } = await convertHeicIfNeeded(
    rawBlob,
    asset.fileName || `image-${Date.now()}.jpg`,
    asset.mimeType || rawBlob.type || "image/jpeg",
  );
  const size = blob.size || asset.fileSize || 1;

  const { uploadURL, objectPath } = await requestUploadUrl({ name, size, contentType });

  const put = await fetch(uploadURL, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) throw new Error(`upload-failed-${put.status}`);

  return { objectPath, localUri: asset.uri };
}
