import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string) {
    return this.prisma.products.findMany({ where: { storeId, deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  async create(storeId: string, body: any) {
    return this.prisma.products.create({
      data: {
        storeId,
        sku: body.sku,
        name: body.name,
        category: body.category ?? null,
        unit: body.unit ?? null,
      },
    });
  }

  async get(storeId: string, id: string) {
    const row = await this.prisma.products.findFirst({ where: { id, storeId } });
    if (!row) throw new Error("Not found");
    return row;
  }

  async update(storeId: string, id: string, body: any) {
    const row = await this.get(storeId, id);
    return this.prisma.products.update({
      where: { id: row.id },
      data: {
        sku: body.sku ?? row.sku,
        name: body.name ?? row.name,
        category: body.category ?? row.category,
        unit: body.unit ?? row.unit,
      },
    });
  }

  async delete(storeId: string, id: string) {
    await this.get(storeId, id);
    await this.prisma.products.update({ where: { id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }
}
