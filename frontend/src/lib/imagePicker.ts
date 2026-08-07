import * as ImagePicker from "expo-image-picker";

/**
 * Pick one or more images from the library, compressed and returned as data URLs
 * ready to POST (base64). Returns [] if permission is denied or the user cancels.
 */
export async function pickImages(limit = 8): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.5,
    base64: true,
  });
  if (res.canceled) return [];
  return res.assets
    .filter((a) => a.base64)
    .map((a) => `data:${a.mimeType || "image/jpeg"};base64,${a.base64}`);
}

/**
 * Pick a single short video from the library, returned as a data URL (base64).
 * Returns null if permission is denied or the user cancels. Videos are large —
 * keep the source clip short (the CMS enforces a ~15MB decoded ceiling).
 */
export async function pickVideo(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "videos",
    allowsMultipleSelection: false,
    quality: 0.5,
    base64: true,
  });
  const a = res.canceled ? null : res.assets[0];
  return a?.base64 ? `data:${a.mimeType || "video/mp4"};base64,${a.base64}` : null;
}

/** Capture a single photo with the camera, returned as a data URL (or null). */
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
  const a = res.canceled ? null : res.assets[0];
  return a?.base64 ? `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` : null;
}
