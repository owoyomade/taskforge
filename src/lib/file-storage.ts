import "server-only";

import { openAsBlob } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { del, get, put } from "@vercel/blob";

/**
 * Where uploaded files (profile photos and task attachments) are kept.
 *
 * - On the live site: Vercel Blob, in a private store. Files have no public
 *   address; the only way to read one is through this module.
 * - On your laptop: the git-ignored .data/uploads folder.
 *
 * The choice is automatic: setting BLOB_READ_WRITE_TOKEN (Vercel adds it
 * when you connect a Blob store) switches to Vercel Blob.
 *
 * This module doesn't decide who may see a file. Every caller checks that
 * in the database first (can_view_avatar, can_access_attachment_path, or
 * Row Level Security on the attachments table).
 */
export type Bucket = "avatars" | "attachments";

export type StoredFile = { stream: ReadableStream<Uint8Array>; size: number };

const LOCAL_ROOT = resolve(process.cwd(), ".data", "uploads");
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

function storesInBlob(): boolean {
  if (blobToken) return true;
  // Vercel's servers have no lasting disk: a file saved there would vanish.
  if (process.env.VERCEL) {
    throw new Error("File storage isn't configured: connect a Vercel Blob store (BLOB_READ_WRITE_TOKEN).");
  }
  return false;
}

/**
 * Turns a bucket and path into a storage key, refusing anything that could
 * escape its folder (".." segments, absolute paths, backslashes).
 */
function storageKey(bucket: Bucket, path: string): string {
  const segments = path.split("/");
  if (path.length === 0 || path.length > 400 || path.includes("\\") || segments.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Invalid file path.");
  }
  return `${bucket}/${path}`;
}

function localFile(key: string): string {
  const file = resolve(LOCAL_ROOT, key);
  // Belt and braces: the resolved file must still sit inside the uploads folder.
  if (!file.startsWith(LOCAL_ROOT + sep)) throw new Error("Invalid file path.");
  return file;
}

export async function saveFile(bucket: Bucket, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const key = storageKey(bucket, path);
  if (storesInBlob()) {
    // Paths already contain a random id, so no extra suffix and never an overwrite.
    await put(key, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false, token: blobToken });
    return;
  }
  const file = localFile(key);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes, { flag: "wx" });
}

/** The file's contents as a stream, or null if it doesn't exist. */
export async function readFile(bucket: Bucket, path: string): Promise<StoredFile | null> {
  const key = storageKey(bucket, path);
  if (storesInBlob()) {
    const result = await get(key, { access: "private", token: blobToken });
    if (!result || result.statusCode !== 200) return null;
    return { stream: result.stream, size: result.blob.size };
  }
  try {
    const blob = await openAsBlob(localFile(key));
    return { stream: blob.stream(), size: blob.size };
  } catch {
    return null;
  }
}

/** Deletes files; ones that are already gone are ignored. */
export async function deleteFiles(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const keys = paths.map((path) => storageKey(bucket, path));
  if (storesInBlob()) {
    await del(keys, { token: blobToken });
    return;
  }
  await Promise.all(keys.map((key) => rm(localFile(key), { force: true })));
}

/** Where local files live, for tests and the README. */
export const LOCAL_UPLOADS_DIR = join(".data", "uploads");
