import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { OrdersService } from "./orders.service.js";

@Controller("stores/:storeId/orders")
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  @StoreAccess()
  async list(@Param("storeId") storeId: string) {
    return { data: await this.service.list(storeId) };
  }

  @Post("manual")
  // PROMT §5.3/§5.4: pegawai boleh menginput penjualan harian lewat formulir.
  // Aksi ini hanya menambah order baru - tidak mengubah/menghapus data - jadi
  // STAFF diizinkan. Mutasi dataset dan katalog tetap OWNER/ADMIN saja.
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  @StoreAccess()
  async createManual(@Param("storeId") storeId: string, @Body() body: any) {
    return { data: await this.service.createManual(storeId, body) };
  }
}
