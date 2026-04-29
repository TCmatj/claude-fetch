import type { SseEvent } from '../model/capture-record.js';

export function parseSse(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = raw.split(/\n\s*\n/).filter((block) => block.trim().length > 0);

  for (const block of blocks) {
    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }

    const dataText = dataLines.join('\n');
    let data: unknown = dataText;
    if (dataText.length > 0) {
      try {
        data = JSON.parse(dataText);
      } catch {
        data = dataText;
      }
    }

    events.push({ event, data, raw: block });
  }

  return events;
}
