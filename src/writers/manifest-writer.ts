import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest, ManifestItem } from '../model/capture-record.js';

export class ManifestWriter {
  private queue = Promise.resolve();

  constructor(
    private readonly outputRoot: string,
    private readonly sessionId: string,
  ) {}

  append(item: ManifestItem): Promise<Manifest> {
    const next = this.queue.then(async () => {
      const manifest = await this.read();
      manifest.generatedAt = new Date().toISOString();
      manifest.items = manifest.items.filter((existing) => existing.id !== item.id).concat(item);
      await mkdir(this.outputRoot, { recursive: true, mode: 0o700 });
      await writeFile(this.path(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      return manifest;
    });
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async read(): Promise<Manifest> {
    try {
      const content = await readFile(this.path(), 'utf8');
      const parsed = JSON.parse(content) as Manifest;
      return {
        sessionId: parsed.sessionId || this.sessionId,
        generatedAt: parsed.generatedAt || new Date().toISOString(),
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return {
        sessionId: this.sessionId,
        generatedAt: new Date().toISOString(),
        items: [],
      };
    }
  }

  private path(): string {
    return path.join(this.outputRoot, 'manifest.json');
  }
}
