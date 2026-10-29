import { describe, expect, it } from "vitest";

import { detectAttachmentType, formatBytes, safeFileName } from "@/lib/file-type";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("detectAttachmentType", () => {
  it("identifies allowed files by their content", () => {
    expect(detectAttachmentType(text("%PDF-1.7 ..."), "brief.pdf")).toBe("application/pdf");
    expect(detectAttachmentType(text("GIF89a"), "anim.gif")).toBe("image/gif");
    expect(detectAttachmentType(bytes(0x50, 0x4b, 0x03, 0x04, 0x14), "plan.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(detectAttachmentType(text("name,amount\nAda,3\n"), "data.csv")).toBe("text/csv");
    expect(detectAttachmentType(text("Meeting notes"), "notes.txt")).toBe("text/plain");
  });

  it("ignores misleading file names", () => {
    // An HTML page renamed to .pdf is still refused.
    expect(detectAttachmentType(text("<html><script>alert(1)</script>"), "invoice.pdf")).toBeNull();
    // A PDF stays a PDF whatever it's called.
    expect(detectAttachmentType(text("%PDF-1.4"), "photo.png")).toBe("application/pdf");
  });

  it("refuses HTML, SVG and binary data disguised as text", () => {
    expect(detectAttachmentType(text("<!DOCTYPE html><p>hi</p>"), "page.txt")).toBeNull();
    expect(detectAttachmentType(text("<svg onload=alert(1)>"), "logo.txt")).toBeNull();
    expect(detectAttachmentType(bytes(0x48, 0x00, 0x49), "sneaky.txt")).toBeNull();
    expect(detectAttachmentType(text("MZ executable"), "setup.exe")).toBeNull();
  });

  it("refuses zip archives with an unknown extension", () => {
    expect(detectAttachmentType(bytes(0x50, 0x4b, 0x03, 0x04), "app.jar")).toBeNull();
  });
});

describe("safeFileName", () => {
  it("strips folders and unsafe characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\ada\\Q3 plan (final).docx")).toBe("Q3 plan _final_.docx");
    expect(safeFileName('report"; rm -rf.pdf')).toBe("report__ rm -rf.pdf");
  });

  it("never returns an empty or hidden name", () => {
    expect(safeFileName("...")).toBe("file");
    expect(safeFileName(".env")).toBe("env");
  });

  it("shortens long names but keeps the extension", () => {
    const name = safeFileName(`${"a".repeat(150)}.pdf`);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("formatBytes", () => {
  it("formats sizes for people", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
