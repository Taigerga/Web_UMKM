import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { ProductsController } from "./products.controller.js";
import { ProductsService } from "./products.service.js";
import { CustomersController } from "./customers.controller.js";
import { CustomersService } from "./customers.service.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController, CustomersController, OrdersController],
  providers: [ProductsService, CustomersService, OrdersService],
})
export class CatalogModule {}
