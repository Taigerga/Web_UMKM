import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { ProductsController } from "./products.controller.js";
import { ProductsService } from "./products.service.js";
import { CustomersController } from "./customers.controller.js";
import { CustomersService } from "./customers.service.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";
import { SuppliersController } from "./suppliers.controller.js";
import { SuppliersService } from "./suppliers.service.js";
import { CategoriesController } from "./categories.controller.js";
import { CategoriesService } from "./categories.service.js";
import { MarginsController } from "./margins.controller.js";
import { MarginsService } from "./margins.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [
    ProductsController,
    CustomersController,
    OrdersController,
    SuppliersController,
    CategoriesController,
    MarginsController,
  ],
  providers: [
    ProductsService,
    CustomersService,
    OrdersService,
    SuppliersService,
    CategoriesService,
    MarginsService,
  ],
})
export class CatalogModule {}
