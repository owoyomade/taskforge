export type AllowedImageType = "image/png" | "image/jpeg" | "image/webp";

/**
 * Identifies an image by its first bytes ("magic numbers").
 *
 * The `type` a browser reports for an upload comes from the file extension
 * and can be anything the sender likes, so we check the actual content.
 * Returns null for anything that isn't PNG, JPEG or WebP.
 */
export function detectImageType(bytes: Uint8Array): AllowedImageType | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  // WebP: "RIFF" <4-byte size> "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";

  return null;
}

export const IMAGE_EXTENSIONS: Record<AllowedImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
