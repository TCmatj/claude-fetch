const DEFAULT_MAX_BUFFER_LENGTH = 1024 * 1024;

export class ChunkLineBuffer {
  private buffered = '';

  constructor(private readonly maxBufferLength = DEFAULT_MAX_BUFFER_LENGTH) {}

  push(chunk: string | Buffer): string[] {
    this.buffered += stripAnsi(chunk.toString());
    if (this.buffered.length > this.maxBufferLength) {
      this.buffered = this.buffered.slice(-this.maxBufferLength);
    }

    const lines: string[] = [];
    let start = 0;
    for (let index = 0; index < this.buffered.length; index += 1) {
      if (this.buffered[index] === '\n') {
        const end = index > start && this.buffered[index - 1] === '\r' ? index - 1 : index;
        lines.push(this.buffered.slice(start, end));
        start = index + 1;
      }
    }
    this.buffered = this.buffered.slice(start);
    return lines;
  }

  flush(): string[] {
    if (!this.buffered) {
      return [];
    }
    const line = this.buffered.endsWith('\r') ? this.buffered.slice(0, -1) : this.buffered;
    this.buffered = '';
    return line ? [line] : [];
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\[[0-?]*[ -/]*[@-~]/g, '');
}
