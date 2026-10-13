import { Injectable } from "@nestjs/common";
import type { Express } from "express";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { PrismaService } from "../database/prisma.service.js";

const STORAGE_ROOT = path.resolve(process.cwd(), "storage", "uploads");

export type DatasetView = {
  id: string;
  storeId: string;
  uploadedById: string;
  status: string;
  fileName: string;
  fileHash: string;
  mimeType: string;
  rowCount: number;
  committedAt: Date | null;
  importedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class DatasetsService {
  constructor(private readonly prisma: PrismaService) {}

  getStoragePath(storeId: string, absoluteFile: string): string {
    const resolved = path.resolve(absoluteFile);
    if (!resolved.startsWith(path.resolve(STORAGE_ROOT, storeId))) {
      throw new Error("Unsafe storage path");
    }
    return resolved;
  }

  async list(storeId: string): Promise<DatasetView[]> {
    const rows = await this.prisma.datasets.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row: any) => this.view(row));
  }

  async upload(
    storeId: string,
    uploadedById: string,
    file: any,
  ): Promise<DatasetView> {
    const absolute = path.resolve(file.path);
    const contents = fs.readFileSync(absolute);
    const fileHash = crypto.createHash("sha256").update(contents).digest("hex");
    const row = await this.prisma.datasets.create({
      data: {
        storeId,
        uploadedById,
        status: "UPLOADED",
        fileName: file.originalname,
        fileHash,
        mimeType: file.mimetype,
        rowCount: 0,
      },
    });

    return this.view(row);
  }

  async get(storeId: string, id: string): Promise<DatasetView> {
    const row = await this.prisma.datasets.findFirst({
      where: { id, storeId },
    });
    if (!row) throw new Error("Not found");
    return this.view(row);
  }

  private view(row: any): DatasetView {
    if (!row) throw new Error("Not found");
    return {
      id: row.id,
      storeId: row.storeId,
      uploadedById: row.uploadedById,
      status: row.status,
      fileName: row.fileName,
      fileHash: row.fileHash,
      mimeType: row.mimeType,
      rowCount: row.rowCount,
      committedAt: row.committedAt,
      importedAt: row.importedAt,
      createdAt: row.createdAt,
    };
  }
}
