-- CreateTable
CREATE TABLE `datasets` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `uploaded_by_id` VARCHAR(191) NOT NULL,
    `status` ENUM('UPLOADED', 'VALIDATED', 'IMPORTED', 'ROLLED_BACK', 'FAILED') NOT NULL DEFAULT 'UPLOADED',
    `file_name` VARCHAR(255) NOT NULL,
    `file_hash` VARCHAR(64) NOT NULL,
    `mime_type` VARCHAR(120) NOT NULL,
    `row_count` INTEGER NOT NULL DEFAULT 0,
    `committed_at` DATETIME(3) NULL,
    `imported_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `datasets_store_id_created_at_idx`(`store_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dataset_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `dataset_id` VARCHAR(191) NOT NULL,
    `mapping_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dataset_issues` (
    `id` VARCHAR(191) NOT NULL,
    `dataset_id` VARCHAR(191) NOT NULL,
    `severity` ENUM('FATAL', 'AUTO_FIX', 'WARN', 'ACCEPT') NOT NULL DEFAULT 'WARN',
    `code` VARCHAR(64) NOT NULL,
    `row_number` INTEGER NULL,
    `column_name` VARCHAR(127) NULL,
    `message` VARCHAR(255) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dataset_issues_dataset_id_severity_idx`(`dataset_id`, `severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(127) NULL,
    `unit` VARCHAR(32) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `products_store_id_name_idx`(`store_id`, `name`),
    UNIQUE INDEX `products_store_id_sku_key`(`store_id`, `sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_prices` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `price` DECIMAL(14, 2) NOT NULL,
    `effective_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_prices_product_id_effective_from_idx`(`product_id`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `segment` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customers_store_id_name_idx`(`store_id`, `name`),
    UNIQUE INDEX `customers_store_id_code_key`(`store_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `dataset_id` VARCHAR(191) NULL,
    `customer_id` VARCHAR(191) NULL,
    `order_date` DATETIME(3) NOT NULL,
    `channel` VARCHAR(64) NULL,
    `total` DECIMAL(14, 2) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `orders_store_id_order_date_idx`(`store_id`, `order_date`),
    INDEX `orders_store_id_customer_id_idx`(`store_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NULL,
    `qty` DECIMAL(14, 4) NOT NULL,
    `price` DECIMAL(14, 2) NOT NULL,
    `discount` DECIMAL(14, 2) NULL,

    INDEX `order_items_order_id_idx`(`order_id`),
    INDEX `order_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `datasets` ADD CONSTRAINT `datasets_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `datasets` ADD CONSTRAINT `datasets_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dataset_mappings` ADD CONSTRAINT `dataset_mappings_dataset_id_fkey` FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dataset_issues` ADD CONSTRAINT `dataset_issues_dataset_id_fkey` FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_prices` ADD CONSTRAINT `product_prices_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_dataset_id_fkey` FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
