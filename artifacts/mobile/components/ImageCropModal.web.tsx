import React, { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Cropper, { type Area } from "react-easy-crop";
import { useColors } from "@/hooks/useColors";

export interface ImageCropModalProps {
  /** Source uri of the image to crop, or null when the modal is hidden. */
  imageUri: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.setAttribute("crossOrigin", "anonymous");
    img.src = src;
  });
}

async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const size = Math.max(1, Math.round(area.width));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-unavailable");
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    size,
    size,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("crop-failed"))),
      "image/jpeg",
      0.9,
    );
  });
}

export function ImageCropModal({ imageUri, onCancel, onConfirm }: ImageCropModalProps) {
  const colors = useColors();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setAreaPixels(areaPx);
  }, []);

  const handleConfirm = async () => {
    if (!imageUri || !areaPixels) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(imageUri, areaPixels);
      await onConfirm(blob);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    onCancel();
  };

  return (
    <Modal visible={!!imageUri} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>사진 편집</Text>

          <View style={styles.cropArea}>
            {imageUri ? (
              <Cropper
                image={imageUri}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : null}
          </View>

          <View style={styles.zoomRow}>
            <Text style={[styles.zoomLabel, { color: colors.mutedForeground }]}>축소</Text>
            {/* react-native-web renders this input as a native range slider */}
            {React.createElement("input" as any, {
              type: "range",
              min: 1,
              max: 3,
              step: 0.01,
              value: zoom,
              onChange: (e: any) => setZoom(Number(e.target.value)),
              style: { flex: 1, accentColor: colors.primary, cursor: "pointer" },
            })}
            <Text style={[styles.zoomLabel, { color: colors.mutedForeground }]}>확대</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                styles.cancelBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleCancel}
              disabled={busy}
            >
              <Text style={[styles.btnText, { color: colors.foreground }]}>취소</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: colors.primary, opacity: busy || pressed ? 0.8 : 1 },
              ]}
              onPress={handleConfirm}
              disabled={busy || !areaPixels}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.btnText, { color: "#fff" }]}>적용</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginBottom: 16,
  },
  cropArea: {
    position: "relative",
    width: "100%",
    height: 300,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  zoomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  },
  zoomLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    borderWidth: 1,
  },
  btnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
