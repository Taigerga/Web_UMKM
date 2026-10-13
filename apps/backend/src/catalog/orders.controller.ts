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
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess()
  async createManual(@Param("storeId") storeId: string, @Body() body: any) {
    return { data: await this.service.createManual(storeId, body) };
  }
}
