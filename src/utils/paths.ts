import path from 'node:path';

export function resolveOutputRoot(output?: string): string {
  const root = output && output.trim().length > 0
    ? output
    : path.join(process.cwd(), 'claude-fetch-output');
  return path.resolve(root);
}

export function toPosixRelative(from: string, target: string): string {
  return path.relative(from, target).split(path.sep).join('/');
}

export function captureDatePath(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function captureFilePrefix(date = new Date()): string {
  return date.toISOString().replaceAll(':', '-').replace('.', '-');
}
