import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const READ_CHUNK_BYTES = 64 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export const NORMALIZED_FPL_FILE_LIMITS = Object.freeze({
  'manifest.json': 256 * 1024,
  'players.json': 8 * 1024 * 1024,
  'fixtures.json': 8 * 1024 * 1024,
  'teams.json': 512 * 1024,
  'events.json': 512 * 1024
} as const);

type NormalizedFplFileName = keyof typeof NORMALIZED_FPL_FILE_LIMITS;

export async function readNormalizedFplJson(filePath: string): Promise<unknown> {
  const fileName = path.basename(filePath);
  if (!isNormalizedFplFileName(fileName)) {
    throw new Error('Unsupported normalized FPL input file');
  }
  return readBoundedJsonFile(filePath, fileName, NORMALIZED_FPL_FILE_LIMITS[fileName]);
}

export async function readBoundedJsonFile(
  filePath: string,
  fileName: string,
  maxBytes: number
): Promise<unknown> {
  let initialStats;
  try {
    initialStats = await lstat(filePath);
  } catch {
    throw new Error(`Unable to inspect local JSON input: ${path.basename(fileName)}`);
  }

  const safeName = path.basename(fileName);
  if (initialStats.isSymbolicLink() || !initialStats.isFile()) {
    throw new Error(`Local JSON input must be a regular non-symlink file: ${safeName}`);
  }
  if (initialStats.size > maxBytes) {
    throw new Error(`Local JSON input exceeds its byte limit: ${safeName}`);
  }

  const openFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(filePath, openFlags);
  } catch {
    throw new Error(`Unable to open local JSON input safely: ${safeName}`);
  }

  try {
    const openedStats = await handle.stat();
    if (
      !openedStats.isFile() ||
      openedStats.dev !== initialStats.dev ||
      openedStats.ino !== initialStats.ino ||
      openedStats.size > maxBytes
    ) {
      throw new Error(`Local JSON input changed or exceeded its byte limit: ${safeName}`);
    }

    const chunks: Buffer[] = [];
    let bytesRead = 0;
    while (bytesRead <= maxBytes) {
      const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, maxBytes - bytesRead + 1));
      const read = await handle.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) {
        break;
      }
      bytesRead += read.bytesRead;
      if (bytesRead > maxBytes) {
        throw new Error(`Local JSON input exceeds its byte limit: ${safeName}`);
      }
      chunks.push(buffer.subarray(0, read.bytesRead));
    }

    const finalStats = await handle.stat();
    let finalPathStats;
    try {
      finalPathStats = await lstat(filePath);
    } catch {
      throw new Error(`Local JSON input changed while it was being read: ${safeName}`);
    }
    if (
      finalPathStats.isSymbolicLink() ||
      !finalPathStats.isFile() ||
      finalPathStats.dev !== openedStats.dev ||
      finalPathStats.ino !== openedStats.ino ||
      finalStats.size > maxBytes ||
      bytesRead !== finalStats.size ||
      openedStats.size !== finalStats.size ||
      openedStats.mtimeMs !== finalStats.mtimeMs ||
      openedStats.ctimeMs !== finalStats.ctimeMs
    ) {
      throw new Error(`Local JSON input changed or exceeded its byte limit: ${safeName}`);
    }

    try {
      return JSON.parse(UTF8_DECODER.decode(Buffer.concat(chunks, bytesRead)));
    } catch {
      throw new Error(`Local JSON input is not valid strict JSON: ${safeName}`);
    }
  } finally {
    await handle.close();
  }
}

function isNormalizedFplFileName(value: string): value is NormalizedFplFileName {
  return Object.prototype.hasOwnProperty.call(NORMALIZED_FPL_FILE_LIMITS, value);
}
