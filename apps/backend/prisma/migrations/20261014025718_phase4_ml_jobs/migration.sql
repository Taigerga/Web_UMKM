/*
  Warnings:

  - You are about to drop the column `file_path` on the `datasets` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `datasets` DROP COLUMN `file_path`;

-- CreateTable
CREATE TABLE `product_categories` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(127) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `product_categories_store_id_idx`(`store_id`),
    UNIQUE INDEX `product_categories_store_id_name_key`(`store_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contact` VARCHAR(127) NULL,
    `address` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `suppliers_store_id_idx`(`store_id`),
    UNIQUE INDEX `suppliers_store_id_name_key`(`store_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_suppliers` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NOT NULL,
    `cost_price` DECIMAL(14, 2) NOT NULL,
    `lead_days` INTEGER NOT NULL DEFAULT 7,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_suppliers_product_id_idx`(`product_id`),
    INDEX `product_suppliers_supplier_id_idx`(`supplier_id`),
    UNIQUE INDEX `product_suppliers_product_id_supplier_id_key`(`product_id`, `supplier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_margins` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `cost_price` DECIMAL(14, 2) NOT NULL,
    `margin_percent` DECIMAL(5, 2) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_margins_product_id_key`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `forecast_results` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `forecast_date` DATETIME(3) NOT NULL,
    `predicted_qty` DECIMAL(14, 4) NOT NULL,
    `confidence` DECIMAL(5, 2) NOT NULL DEFAULT 0.95,
    `lower_bound` DECIMAL(14, 4) NULL,
    `upper_bound` DECIMAL(14, 4) NULL,
    `computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `forecast_results_store_id_forecast_date_idx`(`store_id`, `forecast_date`),
    INDEX `forecast_results_product_id_idx`(`product_id`),
    UNIQUE INDEX `forecast_results_product_id_forecast_date_key`(`product_id`, `forecast_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ml_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `job_type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `input_params` JSON NULL,
    `result` JSON NULL,
    `error_message` VARCHAR(191) NULL,
    `idempotency_key` VARCHAR(191) NULL,
    `worker_id` VARCHAR(191) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ml_jobs_idempotency_key_key`(`idempotency_key`),
    INDEX `ml_jobs_store_id_status_idx`(`store_id`, `status`),
    INDEX `ml_jobs_status_started_at_idx`(`status`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_suppliers` ADD CONSTRAINT `product_suppliers_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_suppliers` ADD CONSTRAINT `product_suppliers_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_margins` ADD CONSTRAINT `product_margins_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forecast_results` ADD CONSTRAINT `forecast_results_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forecast_results` ADD CONSTRAINT `forecast_results_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ml_jobs` ADD CONSTRAINT `ml_jobs_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
