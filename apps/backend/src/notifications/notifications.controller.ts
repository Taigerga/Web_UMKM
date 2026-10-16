import { Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthUser } from "../common/types/auth-user.js";
import { NotificationsService } from "./notifications.service.js";

@ApiBearerAuth("bearer")
@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Daftar notifikasi user" })
  async list(
    @CurrentUser() user: AuthUser,
    @Query("storeId") storeId?: string,
    @Query("status") status?: "all" | "unread" | "read",
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const result = await this.service.listForUser(user.userId, {
      storeId,
      status: status ?? "all",
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
    return { data: result.items, meta: { total: result.total } };
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Jumlah notifikasi belum dibaca" })
  async unreadCount(@CurrentUser() user: AuthUser, @Query("storeId") storeId?: string) {
    const count = await this.service.unreadCount(user.userId, storeId);
    return { data: { count } };
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Tandai satu notifikasi sebagai dibaca" })
  async markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const item = await this.service.markRead(id, user.userId);
    return { data: item };
  }

  @Post("read-all")
  @ApiOperation({ summary: "Tandai semua notifikasi sebagai dibaca" })
  async markAllRead(@CurrentUser() user: AuthUser, @Query("storeId") storeId?: string) {
    const count = await this.service.markAllRead(user.userId, storeId);
    return { data: { updated: count } };
  }
}
