import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string) {
    return this.prisma.customers.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } });
  }

  async create(storeId: string, body: any) {
    return this.prisma.customers.upsert({
      where: { storeId_code: { storeId, code: body.code } },
      update: { name: body.name, segment: body.segment ?? null },
      create: { storeId, code: body.code, name: body.name, segment: body.segment ?? null },
    });
  }

  async get(storeId: string, id: string) {
    const row = await this.prisma.customers.findFirst({ where: { id, storeId } });
    if (!row) throw new Error("Not found");
    return row;
  }

  async update(storeId: string, id: string, body: any) {
    const row = await this.get(storeId, id);
    return this.prisma.customers.update({
      where: { id: row.id },
      data: {
        code: body.code ?? row.code,
        name: body.name ?? row.name,
        segment: body.segment ?? row.segment,
      },
    });
  }
}
