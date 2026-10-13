import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { Decimal } from "@prisma/client/runtime/library.js";

@Injectable()
export class MarginsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMargin(storeId: string, productId: string) {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new Error("Product not found");

    const margin = await this.prisma.productMargins.findUnique({
      where: { productId },
    });

    if (!margin) {
      return null;
    }

    const sellPrice = this.calculateSellPrice(margin.costPrice, margin.marginPercent);

    return {
      productId: margin.productId,
      costPrice: Number(margin.costPrice),
      marginPercent: Number(margin.marginPercent),
      sellPrice: Number(sellPrice),
    };
  }

  async setMargin(storeId: string, productId: string, body: any) {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new Error("Product not found");

    const costPrice = new Decimal(body.costPrice);
    const marginPercent = new Decimal(body.marginPercent);

    // Validate: margin should be between 0-100
    if (marginPercent.lessThan(0) || marginPercent.greaterThan(100)) {
      throw new Error("Margin percent harus antara 0-100");
    }

    const margin = await this.prisma.productMargins.upsert({
      where: { productId },
      create: {
        productId,
        costPrice,
        marginPercent,
      },
      update: {
        costPrice,
        marginPercent,
      },
    });

    const sellPrice = this.calculateSellPrice(margin.costPrice, margin.marginPercent);

    return {
      productId: margin.productId,
      costPrice: Number(margin.costPrice),
      marginPercent: Number(margin.marginPercent),
      sellPrice: Number(sellPrice),
    };
  }

  private calculateSellPrice(costPrice: Decimal, marginPercent: Decimal): Decimal {
    // sellPrice = costPrice / (1 - margin%)
    // margin% = (sellPrice - costPrice) / sellPrice
    const marginDecimal = marginPercent.dividedBy(100);
    const oneMinusMargin = new Decimal(1).minus(marginDecimal);
    if (oneMinusMargin.equals(0)) {
      throw new Error("Margin 100% tidak valid");
    }
    return costPrice.dividedBy(oneMinusMargin);
  }
}
