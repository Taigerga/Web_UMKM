import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { CustomersService } from "./customers.service.js";

@Controller("stores/:storeId/customers")
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @StoreAccess()
  async list(@Param("storeId") storeId: string) {
    return { data: await this.service.list(storeId) };
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess()
  async create(@Param("storeId") storeId: string, @Body() body: any) {
    return { data: await this.service.create(storeId, body) };
  }

  @Patch(":id")
  @Roles(Role.OWNER, Role.ADMIN)
  @StoreAccess()
  async update(@Param("storeId") storeId: string, @Param("id") id: string, @Body() body: any) {
    return { data: await this.service.update(storeId, id, body) };
  }
}
