import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

interface CacheEntry { value: string; expiresAt: number; }

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly store = new Map<string, CacheEntry>();

  async onModuleInit() {}
  async onModuleDestroy() {}

  private purgeExpired() {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt <= now) this.store.delete(k);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    this.purgeExpired();
    const e = this.store.get(key);
    if (!e) return null;
    try { return JSON.parse(e.value) as T; } catch { return null; }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    this.store.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) this.store.delete(k);
  }

  async invalidateStoreMetrics(storeId: string): Promise<void> {
    const prefix = `store:${storeId}:`;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }
}
