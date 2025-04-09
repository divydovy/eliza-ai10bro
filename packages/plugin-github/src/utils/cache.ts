export class Cache<T> {
  private cache: Map<string, { value: T; timestamp: number }>;
  private ttl: number;

  constructor(ttl: number = 24 * 60 * 60 * 1000) { // Default 24 hours
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}