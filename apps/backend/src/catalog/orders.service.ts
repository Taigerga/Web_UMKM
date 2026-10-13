import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string) {
    return this.prisma.orders.findMany({
      where: { storeId },
      include: { items: true, customer: true },
      orderBy: { createdAt: "desc" },
    });
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
