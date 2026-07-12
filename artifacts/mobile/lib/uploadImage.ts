import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { customFetch, requestUploadUrl } from "@workspace/api-client-react";
import { convertHeicIfNeeded } from "./convertHeic";

export interface UploadedImage {
  /** Canonical object path to persist in the message content (`/objects/<id>`). */
  objectPath: string;
  /** Local uri of the picked asset (useful for instant previews). */
  localUri: string;
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class ImageTooLargeError extends Error {
  constructor() {
    super("image-too-large");
    this.name = "ImageTooLargeError";
  }
}

export class UploadCancelledError extends Error {
  constructor() {
    super("upload-cancelled");
    this.name = "UploadCancelledError";
  }
}

export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

type ApiUploadResponse = {
  objectPath: string;
};

export class PermissionDeniedError extends Error {
  constructor() {
    super("permission-denied");
    this.name = "PermissionDeniedError";
  }
}

export function putBlob(
  uploadURL: string,
  blob: Blob,
  contentType: string,
  options: UploadOptions = {},
): Promise<void> {
  if (options.signal?.aborted) return Promise.reject(new UploadCancelledError());

  if (Platform.OS === "web") {
    options.onProgress?.(0);
    return fetch(uploadURL, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": contentType },
      signal: options.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`upload-failed-${response.status}`);
        options.onProgress?.(100);
      })
      .catch((error) => {
        if (options.signal?.aborted || error?.name === "AbortError") {
          throw new UploadCancelledError();
        }
        throw error;
      });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();

    xhr.open("PUT", uploadURL);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      options.signal?.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`upload-failed-${xhr.status}`));
      }
    };
    xhr.onerror = () => {
      options.signal?.removeEventListener("abort", abort);
      reject(new Error("upload-failed-network"));
    };
    xhr.onabort = () => {
      options.signal?.removeEventListener("abort", abort);
      reject(new UploadCancelledError());
    };

    options.signal?.addEventListener("abort", abort, { once: true });
    options.onProgress?.(0);
    xhr.send(blob);
  });
}

/**
 * Upload a blob straight to object storage via a presigned URL and return the
 * canonical object path (`/objects/<id>`). Shared by the chat image flow and
 * the profile-image crop flow.
 */
export async function uploadBlob(
  blob: Blob,
  name = `image-${Date.now()}.jpg`,
  options: UploadOptions = {},
): Promise<string> {
  const contentType = blob.type || "image/jpeg";
  const size = blob.size || 1;
  if (size > MAX_IMAGE_BYTES) throw new ImageTooLargeError();

  if (Platform.OS === "web") {
    return uploadBlobViaApi(blob, name, contentType, options);
  }

  const { uploadURL, objectPath } = await requestUploadUrl({ name, size, contentType });

  await putBlob(uploadURL, blob, contentType, options);

  return objectPath;
}

/**
 * Upload one image picker asset straight to object storage and return the stored
 * object path. Shared by single and multi-select picker flows.
 */
async function uploadImagePickerAsset(
  asset: ImagePicker.ImagePickerAsset,
  options: UploadOptions = {},
): Promise<UploadedImage> {
  const rawBlob = await (await fetch(asset.uri)).blob();
  // iPhone photos are HEIC; convert to JPEG (web only) so every recipient can
  // see them. No-op for non-HEIC images and on native.
  const { blob, name, contentType } = await convertHeicIfNeeded(
    rawBlob,
    asset.fileName || `image-${Date.now()}.jpg`,
    asset.mimeType || rawBlob.type || "image/jpeg",
  );
  const size = blob.size || asset.fileSize || 1;
  if (size > MAX_IMAGE_BYTES) throw new ImageTooLargeError();

  if (Platform.OS === "web") {
    const objectPath = await uploadBlobViaApi(blob, name, contentType, options);
    return { objectPath, localUri: asset.uri };
  }

  const { uploadURL, objectPath } = await requestUploadUrl({ name, size, contentType });

  await putBlob(uploadURL, blob, contentType, options);

  return { objectPath, localUri: asset.uri };
}

/**
 * Open the image library, upload all chosen images straight to object storage,
 * and return their stored object paths. Returns `null` when the user cancels.
 */
export async function pickAndUploadImages(options: UploadOptions = {}): Promise<UploadedImage[] | null> {
  if (Platform.OS !== "web") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new PermissionDeniedError();
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsMultipleSelection: true,
    orderedSelection: true,
  });
  if (result.canceled || !result.assets?.length) return null;

  const uploaded: UploadedImage[] = [];
  const total = result.assets.length;
  for (const [index, asset] of result.assets.entries()) {
    const aggregateOptions: UploadOptions = {
      signal: options.signal,
      onProgress: options.onProgress
        ? (progress) => {
            const aggregate = Math.round(((index + progress / 100) / total) * 100);
            options.onProgress?.(Math.min(99, aggregate));
          }
        : undefined,
    };
    uploaded.push(await uploadImagePickerAsset(asset, aggregateOptions));
  }

  options.onProgress?.(100);
  return uploaded;
}

/**
 * Open the image library, upload the chosen image straight to object storage
 * via a presigned URL, and return the stored object path. Returns `null` when
 * the user cancels.
 */
export async function pickAndUploadImage(options: UploadOptions = {}): Promise<UploadedImage | null> {
  const uploaded = await pickAndUploadImages(options);
  return uploaded?.[0] ?? null;
}

export async function uploadBlobViaApi(
  blob: Blob,
  name: string,
  contentType: string,
  options: UploadOptions = {},
): Promise<string> {
  if (options.signal?.aborted) throw new UploadCancelledError();

  const size = blob.size || 1;
  const params = new URLSearchParams({ name, size: String(size), contentType });
  options.onProgress?.(0);

  try {
    const response = await customFetch<ApiUploadResponse>(`/api/storage/uploads/object?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: blob,
      signal: options.signal,
      responseType: "json",
    });
    options.onProgress?.(100);
    return response.objectPath;
  } catch (error) {
    if (options.signal?.aborted || (error as { name?: string })?.name === "AbortError") {
      throw new UploadCancelledError();
    }
    throw error;
  }
}
