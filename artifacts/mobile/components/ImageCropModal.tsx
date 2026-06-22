import React from "react";

export interface ImageCropModalProps {
  /** Source uri of the image to crop, or null when the modal is hidden. */
  imageUri: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}

/**
 * Native placeholder. On native the crop UI is handled by expo-image-picker's
 * built-in editor (`allowsEditing` + `aspect`), so this modal is never shown.
 * The real implementation lives in `ImageCropModal.web.tsx`.
 */
export function ImageCropModal(_props: ImageCropModalProps) {
  return null;
}
