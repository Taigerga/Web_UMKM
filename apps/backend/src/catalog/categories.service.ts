import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string) {
    return this.prisma.productCategories.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(storeId: string, body: any) {
    return this.prisma.productCategories.create({
      data: {
        storeId,
        name: body.name,
        description: body.description ?? null,
      },
    });
  }

  async get(storeId: string, id: string) {
    const row = await this.prisma.productCategories.findFirst({
      where: { id, storeId },
    });
    if (!row) throw new Error("Not found");
    return row;
  }

  async update(storeId: string, id: string, body: any) {
    await this.get(storeId, id);
    return this.prisma.productCategories.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        description: body.description ?? undefined,
      },
    });
  }

  async delete(storeId: string, id: string) {
    await this.get(storeId, id);
    await this.prisma.productCategories.delete({ where: { id } });
    return { deleted: true };
  }
}
