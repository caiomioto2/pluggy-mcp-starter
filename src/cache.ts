export class TimedSnapshotCache<T> {
  private entry: { key: string; at: number; value: T } | undefined;

  async get(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ value: T; at: number }> {
    if (!this.entry || this.entry.key !== key || Date.now() - this.entry.at > ttlMs) {
      this.entry = { key, at: Date.now(), value: await load() };
    }
    return { value: this.entry.value, at: this.entry.at };
  }

  invalidate(): void {
    this.entry = undefined;
  }
}
