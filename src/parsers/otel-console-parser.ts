export type OTelEvent = {
  body: string;
  timestamp?: number;
  attributes: Record<string, string>;
};

export class OTelConsoleParser {
  private collecting = false;
  private depth = 0;
  private lines: string[] = [];

  parseLine(line: string): OTelEvent[] {
    if (!this.collecting && line.trim() !== '{') {
      return [];
    }

    if (!this.collecting) {
      this.collecting = true;
      this.depth = 0;
      this.lines = [];
    }

    this.lines.push(line);
    this.depth += countChar(line, '{');
    this.depth -= countChar(line, '}');

    if (this.depth > 0) {
      return [];
    }

    const block = this.lines.join('\n');
    this.collecting = false;
    this.lines = [];
    return parseEventBlock(block);
  }
}

function parseEventBlock(block: string): OTelEvent[] {
  const body = matchString(block, /^\s*body:\s*"([^"]+)",/m);
  if (!body?.startsWith('claude_code.')) {
    return [];
  }
  const attributesBlocks = matchObjects(block, 'attributes');
  const attributesBlock = attributesBlocks.at(-1);
  const attributes = attributesBlock ? parseAttributes(attributesBlock) : {};
  const timestampText = matchString(block, /^\s*timestamp:\s*(\d+),/m);
  return [{
    body,
    timestamp: timestampText ? Number(timestampText) : undefined,
    attributes,
  }];
}

function matchObjects(block: string, key: string): string[] {
  const matches = [...block.matchAll(new RegExp(`^\\s*${key}: \\{`, 'gm'))];
  const objects: string[] = [];
  for (const match of matches) {
    if (match.index === undefined) {
      continue;
    }
    let depth = 0;
    const lines = block.slice(match.index).split('\n');
    const result: string[] = [];
    let started = false;
    for (const line of lines) {
      if (!started && !line.includes('{')) {
        continue;
      }
      started = true;
      result.push(line);
      depth += countChar(line, '{');
      depth -= countChar(line, '}');
      if (depth <= 0) {
        break;
      }
    }
    objects.push(result.join('\n'));
  }
  return objects;
}

function parseAttributes(block: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = line.trim().match(/^"?([^":]+)"?:\s*"?(.+?)"?,?$/);
    if (!match || match[1] === 'attributes') {
      continue;
    }
    attributes[match[1]] = unescapeValue(match[2]);
  }
  return attributes;
}

function matchString(block: string, regex: RegExp): string | undefined {
  return regex.exec(block)?.[1];
}

function unescapeValue(value: string): string {
  return value.replace(/,$/, '').replace(/^"|"$/g, '');
}

function countChar(value: string, char: string): number {
  return [...value].filter((item) => item === char).length;
}
