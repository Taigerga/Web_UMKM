import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import * as redis from "redis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: redis.RedisClient | null = null;

  async onModuleInit() {
    try {
      const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
      this.client = redis.createClient({ url: redisUrl });
      this.client.on("error", (err) => console.error("Redis error:", err));
      await this.client.connect();
      console.log("Redis connected");
    } catch (error) {
      console.warn("Redis unavailable, using in-memory fallback:", error);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.warn("Redis set failed:", error);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.client) return;
    try {
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.warn("Redis del failed:", error);
    }
  }

  async invalidateStoreMetrics(storeId: string): Promise<void> {
    const patterns = [
      `store:${storeId}:metric:*`,
    ];
    if (!this.client) return;
    try {
      for (const pattern of patterns) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.del(...keys);
        }
      }
    } catch (error) {
      console.warn("Redis invalidate failed:", error);
    }
  }
}
