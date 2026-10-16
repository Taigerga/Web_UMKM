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

  /**
   * Ekspor daftar pelanggan (data minimal) difilter per segmen.
   *
   * Hanya `code`, `name`, dan `segment` yang keluar. Kolom tidak dikirim
   * ke CSV karena memang tidak dibutuhkan untuk kampanye, dan minimisasi
   * data adalah syarat ekspor pelanggan di Prompt 16.2.
   */
  async exportSegments(storeId: string, segment?: string): Promise<{ csv: Buffer; count: number; segment: string }> {
    const where: any = { storeId };
    if (segment) where.segment = segment;
    const rows = await this.prisma.customers.findMany({
      where,
      orderBy: [{ segment: "asc" }, { code: "asc" }],
    });

    const escape = (value: string | null | undefined): string => {
      const text = value ?? "";
      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = ["Kode,Nama,Segmen"];
    for (const row of rows) {
      lines.push([escape(row.code), escape(row.name), escape(row.segment)].join(","));
    }

    return {
      csv: Buffer.from(lines.join("\n"), "utf-8"),
      count: rows.length,
      segment: segment ?? "all",
    };
  }
}
