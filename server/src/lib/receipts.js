import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileTypeFromBuffer } from 'file-type';

/** Receipt photos live on disk: <UPLOAD_DIR>/<userId>/<transactionId>.<ext> (default server/uploads). */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || fileURLToPath(new URL('../../uploads', import.meta.url)));

/** Receipt formats accepted for upload. */
export const RECEIPT_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;
// For serving: also HEIC files uploaded before only JPG/PNG/WEBP were allowed.
const MIME_BY_EXT = { ...Object.fromEntries(Object.entries(RECEIPT_TYPES).map(([m, e]) => [e, m])), heic: 'image/heic' };

/**
 * The receipt's real type, read from the file's first bytes (magic numbers) — the Content-Type
 * the browser sent is not trusted. Returns an allowed MIME type, or null.
 */
export async function detectReceiptType(buffer) {
  const t = await fileTypeFromBuffer(buffer).catch(() => undefined);
  return t && RECEIPT_TYPES[t.mime] ? t.mime : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Absolute path for a stored relative path, refusing anything that escapes UPLOAD_DIR. */
export function receiptFile(rel) {
  const abs = path.resolve(UPLOAD_DIR, rel);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) throw new Error('Bad receipt path');
  return abs;
}

export const receiptMime = (rel) => MIME_BY_EXT[path.extname(rel).slice(1).toLowerCase()] || 'application/octet-stream';

/** Writes the file and returns its relative path; removes an older receipt of another type for the same transaction. */
export async function saveReceipt(userId, txId, mimetype, buffer) {
  if (!UUID.test(userId) || !UUID.test(txId)) throw new Error('Bad id');
  const ext = RECEIPT_TYPES[mimetype];
  const dir = path.join(UPLOAD_DIR, userId);
  await mkdir(dir, { recursive: true });
  const names = await readdir(dir).catch(() => []);
  await Promise.all(names.filter((n) => n.startsWith(`${txId}.`) && n !== `${txId}.${ext}`).map((n) => unlink(path.join(dir, n)).catch(() => {})));
  await writeFile(path.join(dir, `${txId}.${ext}`), buffer);
  return `${userId}/${txId}.${ext}`;
}

/** Best-effort delete; a missing file is fine. */
export async function removeReceipt(rel) {
  if (!rel) return;
  try { await unlink(receiptFile(rel)); } catch { /* already gone */ }
}
