import * as DocumentPicker from "expo-document-picker";
import { requestUploadUrl } from "@workspace/api-client-react";

export interface UploadedFile {
  /** Canonical object path to persist (`/objects/<id>`). */
  objectPath: string;
  /** Original filename for display/download. */
  name: string;
  /** Size in bytes (0 when unknown). */
  size: number;
  /** Best-effort MIME type. */
  mimeType: string;
}

/** Files are capped larger than images since they may be documents/archives. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB

export class FileTooLargeError extends Error {
  constructor() {
    super("file-too-large");
    this.name = "FileTooLargeError";
  }
}

/**
 * Open the system document picker, upload the chosen file straight to object
 * storage via a presigned URL, and return its canonical object path plus the
 * original filename/size for display. Returns `null` when the user cancels.
 */
export async function pickAndUploadFile(): Promise<UploadedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const blob = await (await fetch(asset.uri)).blob();
  const size = asset.size ?? blob.size ?? 0;
  if (size > MAX_FILE_BYTES) throw new FileTooLargeError();

  const mimeType = asset.mimeType || blob.type || "application/octet-stream";
  const name = asset.name || `file-${Date.now()}`;

  const { uploadURL, objectPath } = await requestUploadUrl({
    name,
    size: size || 1,
    contentType: mimeType,
  });

  const put = await fetch(uploadURL, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": mimeType },
  });
  if (!put.ok) throw new Error(`upload-failed-${put.status}`);

  return { objectPath, name, size, mimeType };
}
