import { detectImageType } from "@/lib/image-type";

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const OFFICE_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Works out an upload's real type from its content, not its name or the
 * type the browser claims, and returns null for anything not on the
 * allow-list. HTML, SVG, scripts and executables are always rejected
 * because a browser might run them.
 */
export function detectAttachmentType(bytes: Uint8Array, fileName: string): string | null {
  const image = detectImageType(bytes);
  if (image) return image;

  const startsWith = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const extension = extensionOf(fileName);

  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif"; // "GIF8"
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // "%PDF-"

  // Word, Excel and PowerPoint files are zip archives underneath.
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
    return OFFICE_TYPES[extension] ?? (extension === "zip" ? "application/zip" : null);
  }

  // Plain text and CSV: must be valid UTF-8 with no NUL bytes (which would
  // mean binary data), and must not look like HTML or SVG.
  if (extension === "txt" || extension === "csv") {
    const sample = bytes.subarray(0, 8192);
    if (sample.includes(0)) return null;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(sample);
      if (/^\s*<(!doctype|html|svg|script)/i.test(text)) return null;
    } catch {
      return null;
    }
    return extension === "csv" ? "text/csv" : "text/plain";
  }

  return null;
}

/**
 * A file name that's safe to use in a storage path and a download header:
 * no folders, no control characters, and nothing but letters, numbers,
 * spaces, dots, dashes and underscores.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ._-]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "file";
  if (cleaned.length <= 100) return cleaned;
  const extension = extensionOf(cleaned);
  return extension ? `${cleaned.slice(0, 95 - extension.length)}.${extension}` : cleaned.slice(0, 100);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
