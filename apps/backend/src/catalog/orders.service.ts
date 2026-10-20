import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daftar order, TIDAK lagi tanpa batas: versi lama mengembalikan SEMUA
   * order milik toko (termasuk hasil unggah dataset berjumlah ratusan) dan
   * frontend merendernya selembar panjang tanpa awal-akhir (laporan 20 Okt,
   * bug #4). Sekarang ikut kontrak paginasi yang sama dengan modul admin -
   * `PageQueryDto` memaksa `page >= 1` dan `pageSize <= 100`, serta meta
   * `total` supaya frontend bisa merender pager-nya.
   */
  async list(storeId: string, page = 1, pageSize = 20) {
    const [orders, total] = await Promise.all([
      this.prisma.orders.findMany({
        where: { storeId },
        include: { items: true, customer: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.orders.count({ where: { storeId } }),
    ]);
    return {
      data: orders,
      meta: { page, pageSize: Math.min(pageSize, 100), total },
    };
  }

  async createManual(storeId: string, body: any) {
    return this.prisma.$transaction(async (tx: any) => {
      let customerId = body.customerId;
      if (!customerId && body.customerCode) {
        const customer = await tx.customers.upsert({
          where: { storeId_code: { storeId, code: body.customerCode } },
          update: { name: body.customerName ?? body.customerCode },
          create: { storeId, code: body.customerCode, name: body.customerName ?? body.customerCode },
        });
        customerId = customer.id;
      }

      const items = [];
      for (const item of body.items ?? []) {
        let productId = item.productId;
        if (!productId && item.productSku) {
          const product = await tx.products.upsert({
            where: { storeId_sku: { storeId, sku: item.productSku } },
            update: { name: item.productName ?? item.productSku },
            create: { storeId, sku: item.productSku, name: item.productName ?? item.productSku },
          });
          productId = product.id;

          const priceExists = await tx.productPrices.findFirst({ where: { productId } });
          if (!priceExists) {
            await tx.productPrices.create({
              data: { productId, price: Number(item.price ?? 0) },
            });
          }
        }
        items.push({
          productId: productId ?? null,
          qty: Number(item.qty ?? 0),
          price: Number(item.price ?? 0),
          discount: item.discount ?? null,
        });
      }

      const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
      const order = await tx.orders.create({
        data: {
          storeId,
          customerId: customerId ?? null,
          orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
          channel: body.channel ?? "offline",
          total: body.total ?? total,
          items: { create: items },
        },
        include: { items: true, customer: true },
      });

      return order;
    });
  }
}
