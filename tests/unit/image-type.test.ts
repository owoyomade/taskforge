import { describe, expect, it } from "vitest";

import { detectImageType } from "@/lib/image-type";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("detectImageType", () => {
  it("recognises PNG, JPEG and WebP by their content", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe("image/png");
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(
      detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50)),
    ).toBe("image/webp");
  });

  it("rejects SVG even when it's named like an image", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(detectImageType(svg)).toBeNull();
  });

  it("rejects a RIFF file that isn't WebP (for example a WAV)", () => {
    expect(
      detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45)),
    ).toBeNull();
  });

  it("rejects empty and truncated files", () => {
    expect(detectImageType(bytes())).toBeNull();
    expect(detectImageType(bytes(0x89, 0x50))).toBeNull();
  });
});
