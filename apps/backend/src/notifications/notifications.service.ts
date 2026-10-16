import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
type Notification = NonNullable<Awaited<ReturnType<PrismaClient["notifications"]["findFirst"]>>>;

interface NotifyInput {
  userId: string;
  storeId?: string | null;
  type: string;
  title: string;
  body?: string;
  severity?: "info" | "warning" | "success" | "error";
  dedupeKey?: string;
  cooldownMinutes?: number;
  meta?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput): Promise<Notification> {
    if (input.dedupeKey && input.cooldownMinutes) {
      const since = new Date(Date.now() - input.cooldownMinutes * 60_000);
      const existing = await this.prisma.notifications.findFirst({
        where: { dedupeKey: input.dedupeKey, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return existing;
    }

    return this.prisma.notifications.create({
      data: {
        userId: input.userId,
        storeId: input.storeId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        severity: input.severity ?? "info",
        dedupeKey: input.dedupeKey,
        cooldownUntil:
          input.cooldownMinutes && input.dedupeKey
            ? new Date(Date.now() + input.cooldownMinutes * 60_000)
            : null,
        meta: input.meta ?? {},
      },
    });
  }

  async listForUser(
    userId: string,
    params?: {
      storeId?: string;
      status?: "all" | "unread" | "read";
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: Notification[]; total: number }> {
    if (params?.storeId) {
      await this.ensureStoreAccess(userId, params.storeId);
    }
    const status = params?.status ?? "all";
    const where: any = { userId };
    if (params?.storeId) where.storeId = params.storeId;
    if (status === "unread") where.readAt = null;
    if (status === "read") where.readAt = { not: null };

    const [items, total] = await Promise.all([
      this.prisma.notifications.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: params?.limit ?? 50,
        skip: params?.offset ?? 0,
      }),
      this.prisma.notifications.count({ where }),
    ]);
    return { items, total };
  }

  async unreadCount(userId: string, storeId?: string): Promise<number> {
    if (storeId) await this.ensureStoreAccess(userId, storeId);
    return this.prisma.notifications.count({
      where: {
        userId,
        ...(storeId ? { storeId } : {}),
        readAt: null,
      },
    });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notifications.findFirst({ where: { id, userId } });
    if (!notification) throw new ForbiddenException("Notifikasi tidak ditemukan");
    if (notification.readAt) return notification;
    return this.prisma.notifications.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string, storeId?: string): Promise<number> {
    if (storeId) await this.ensureStoreAccess(userId, storeId);
    const result = await this.prisma.notifications.updateMany({
      where: { userId, ...(storeId ? { storeId } : {}), readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  private async ensureStoreAccess(userId: string, storeId: string): Promise<void> {
    const membership = await this.prisma.storeMembers.findFirst({ where: { userId, storeId } });
    if (!membership) throw new ForbiddenException("Akses toko ditolak");
  }
}
