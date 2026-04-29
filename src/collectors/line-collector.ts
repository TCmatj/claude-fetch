import readline from 'node:readline';
import type { Readable } from 'node:stream';

export function collectLines(stream: Readable, onLine: (line: string) => void): void {
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  reader.on('line', onLine);
}
