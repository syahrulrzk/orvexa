import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { env } from "./env";
import { newId } from "./ids";

/**
 * Penyimpanan attachment berbasis filesystem lokal (MVP).
 * Roadmap: S3-compatible / MinIO (lihat docs/ARCHITECTURE.md §10).
 */

function baseDir(): string {
  return resolve(process.cwd(), env.UPLOAD_DIR);
}

function sanitizeFileName(name: string): string {
  const cleaned = basename(name).replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned.slice(0, 120) || "file";
}

/** Simpan file; kembalikan storage key (nama file di disk) dan nama asli yang sudah dibersihkan. */
export async function saveUpload(
  data: Buffer,
  originalName: string,
): Promise<{ storageKey: string; fileName: string }> {
  const dir = baseDir();
  await mkdir(dir, { recursive: true });
  const fileName = sanitizeFileName(originalName);
  const storageKey = `${newId("file")}-${fileName}`;
  await writeFile(join(dir, storageKey), data);
  return { storageKey, fileName };
}

/**
 * Resolve path file di disk. `basename()` mencegah path traversal
 * (mis. storageKey berisi "../../etc/passwd").
 */
export function resolveStoragePath(storageKey: string): string {
  const dir = baseDir();
  const path = resolve(dir, basename(storageKey));
  if (!path.startsWith(dir)) {
    throw new Error("storage key tidak valid");
  }
  return path;
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storageKey));
}
