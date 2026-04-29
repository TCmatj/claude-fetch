import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaptureRecord } from '../model/capture-record.js';
import { captureDatePath, captureFilePrefix } from '../utils/paths.js';

export async function writeCaptureJson(outputRoot: string, record: CaptureRecord): Promise<string> {
  const dir = path.join(outputRoot, 'captures', captureDatePath(new Date(record.startedAt)));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const filePath = path.join(dir, `${captureFilePrefix(new Date(record.startedAt))}_${record.id}.json`);
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return filePath;
}
