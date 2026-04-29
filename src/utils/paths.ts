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
  return localDateParts(date).date;
}

export function captureFilePrefix(date = new Date()): string {
  const parts = localDateParts(date);
  return `${parts.date}T${parts.time}`;
}

type LocalDateParts = {
  date: string;
  time: string;
};

function localDateParts(date: Date): LocalDateParts {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());
  const millisecond = pad3(date.getMilliseconds());
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}-${minute}-${second}-${millisecond}`,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function pad3(value: number): string {
  return String(value).padStart(3, '0');
}
