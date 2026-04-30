/*
  Warnings:

  - You are about to drop the column `new_product_id` on the `purchase_items` table. All the data in the column will be lost.
  - You are about to drop the column `used_product_id` on the `purchase_items` table. All the data in the column will be lost.
  - You are about to drop the column `new_product_id` on the `return_items` table. All the data in the column will be lost.
  - You are about to drop the column `used_product_id` on the `return_items` table. All the data in the column will be lost.
  - You are about to drop the column `new_product_id` on the `sale_items` table. All the data in the column will be lost.
  - You are about to drop the column `used_product_id` on the `sale_items` table. All the data in the column will be lost.
  - You are about to drop the column `new_product_id` on the `stock_movements` table. All the data in the column will be lost.
  - You are about to drop the column `used_product_id` on the `stock_movements` table. All the data in the column will be lost.
  - You are about to drop the `new_products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `used_products` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `new_products` DROP FOREIGN KEY `new_products_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `purchase_items` DROP FOREIGN KEY `purchase_items_new_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `purchase_items` DROP FOREIGN KEY `purchase_items_used_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `return_items` DROP FOREIGN KEY `return_items_new_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `return_items` DROP FOREIGN KEY `return_items_used_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `sale_items` DROP FOREIGN KEY `sale_items_new_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `sale_items` DROP FOREIGN KEY `sale_items_used_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `stock_movements` DROP FOREIGN KEY `stock_movements_new_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `stock_movements` DROP FOREIGN KEY `stock_movements_used_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `used_products` DROP FOREIGN KEY `used_products_company_id_fkey`;

-- DropIndex
DROP INDEX `purchase_items_new_product_id_fkey` ON `purchase_items`;

-- DropIndex
DROP INDEX `purchase_items_used_product_id_fkey` ON `purchase_items`;

-- DropIndex
DROP INDEX `return_items_new_product_id_fkey` ON `return_items`;

-- DropIndex
DROP INDEX `return_items_used_product_id_fkey` ON `return_items`;

-- DropIndex
DROP INDEX `sale_items_new_product_id_fkey` ON `sale_items`;

-- DropIndex
DROP INDEX `sale_items_used_product_id_fkey` ON `sale_items`;

-- DropIndex
DROP INDEX `stock_movements_new_product_id_idx` ON `stock_movements`;

-- DropIndex
DROP INDEX `stock_movements_used_product_id_idx` ON `stock_movements`;

-- AlterTable
ALTER TABLE `cash_transactions` MODIFY `type` ENUM('SALE_INCOME', 'PURCHASE_PAYMENT', 'EXPENSE_OUT', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'REFUND_OUT', 'OTHER_INCOME') NOT NULL;

-- AlterTable
ALTER TABLE `purchase_items` DROP COLUMN `new_product_id`,
    DROP COLUMN `used_product_id`,
    ADD COLUMN `bulk_product_id` INTEGER NULL,
    ADD COLUMN `returned_quantity` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `single_device_id` INTEGER NULL,
    ADD COLUMN `status` ENUM('NORMAL', 'RETURNED', 'PARTIALLY_RETURNED') NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE `purchases` ADD COLUMN `status` ENUM('COMPLETED', 'RETURNED', 'PARTIALLY_RETURNED') NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE `return_items` DROP COLUMN `new_product_id`,
    DROP COLUMN `used_product_id`,
    ADD COLUMN `bulk_product_id` INTEGER NULL,
    ADD COLUMN `single_device_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `sale_items` DROP COLUMN `new_product_id`,
    DROP COLUMN `used_product_id`,
    ADD COLUMN `bulk_product_id` INTEGER NULL,
    ADD COLUMN `returned_quantity` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `single_device_id` INTEGER NULL,
    ADD COLUMN `status` ENUM('NORMAL', 'RETURNED', 'PARTIALLY_RETURNED') NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE `sales` ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `status` ENUM('COMPLETED', 'RETURNED', 'PARTIALLY_RETURNED') NOT NULL DEFAULT 'COMPLETED',
    ADD COLUMN `supplier_amount` DECIMAL(12, 2) NULL,
    ADD COLUMN `supplier_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `stock_movements` DROP COLUMN `new_product_id`,
    DROP COLUMN `used_product_id`,
    ADD COLUMN `bulk_product_id` INTEGER NULL,
    ADD COLUMN `single_device_id` INTEGER NULL;

-- DropTable
DROP TABLE `new_products`;

-- DropTable
DROP TABLE `used_products`;

-- CreateTable
CREATE TABLE `bulk_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `barcode` VARCHAR(191) NULL,
    `brand` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `purchase_price` DECIMAL(12, 2) NOT NULL,
    `selling_price` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `bulk_products_company_id_brand_model_idx`(`company_id`, `brand`, `model`),
    INDEX `bulk_products_company_id_category_idx`(`company_id`, `category`),
    UNIQUE INDEX `bulk_products_company_id_barcode_key`(`company_id`, `barcode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `single_devices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `imei` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `specs` VARCHAR(191) NULL,
    `battery_health` INTEGER NULL,
    `device_condition` ENUM('NEW', 'USED', 'DISPLAY') NOT NULL DEFAULT 'USED',
    `condition_note` TEXT NULL,
    `status` ENUM('IN_STOCK', 'SOLD', 'REPAIR', 'RETURNED') NOT NULL DEFAULT 'IN_STOCK',
    `purchase_price` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `single_devices_company_id_status_idx`(`company_id`, `status`),
    INDEX `single_devices_company_id_imei_idx`(`company_id`, `imei`),
    UNIQUE INDEX `single_devices_company_id_imei_key`(`company_id`, `imei`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `incomes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `employee_id` INTEGER NULL,
    `title` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'GENEL',
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `incomes_company_id_created_at_idx`(`company_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_returns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `supplier_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `purchase_id` INTEGER NULL,
    `total_amount` DECIMAL(12, 2) NOT NULL,
    `received_amount` DECIMAL(12, 2) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `supplier_returns_company_id_idx`(`company_id`),
    INDEX `supplier_returns_supplier_id_idx`(`supplier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_return_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplier_return_id` INTEGER NOT NULL,
    `purchase_item_id` INTEGER NULL,
    `bulk_product_id` INTEGER NULL,
    `single_device_id` INTEGER NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(12, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `stock_movements_bulk_product_id_idx` ON `stock_movements`(`bulk_product_id`);

-- CreateIndex
CREATE INDEX `stock_movements_single_device_id_idx` ON `stock_movements`(`single_device_id`);

-- AddForeignKey
ALTER TABLE `bulk_products` ADD CONSTRAINT `bulk_products_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `single_devices` ADD CONSTRAINT `single_devices_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales` ADD CONSTRAINT `sales_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_bulk_product_id_fkey` FOREIGN KEY (`bulk_product_id`) REFERENCES `bulk_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_single_device_id_fkey` FOREIGN KEY (`single_device_id`) REFERENCES `single_devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_bulk_product_id_fkey` FOREIGN KEY (`bulk_product_id`) REFERENCES `bulk_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_single_device_id_fkey` FOREIGN KEY (`single_device_id`) REFERENCES `single_devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_items` ADD CONSTRAINT `return_items_bulk_product_id_fkey` FOREIGN KEY (`bulk_product_id`) REFERENCES `bulk_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_items` ADD CONSTRAINT `return_items_single_device_id_fkey` FOREIGN KEY (`single_device_id`) REFERENCES `single_devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incomes` ADD CONSTRAINT `incomes_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incomes` ADD CONSTRAINT `incomes_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_bulk_product_id_fkey` FOREIGN KEY (`bulk_product_id`) REFERENCES `bulk_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_single_device_id_fkey` FOREIGN KEY (`single_device_id`) REFERENCES `single_devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_returns` ADD CONSTRAINT `supplier_returns_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_returns` ADD CONSTRAINT `supplier_returns_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_returns` ADD CONSTRAINT `supplier_returns_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_returns` ADD CONSTRAINT `supplier_returns_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_return_items` ADD CONSTRAINT `supplier_return_items_supplier_return_id_fkey` FOREIGN KEY (`supplier_return_id`) REFERENCES `supplier_returns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_return_items` ADD CONSTRAINT `supplier_return_items_purchase_item_id_fkey` FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_return_items` ADD CONSTRAINT `supplier_return_items_bulk_product_id_fkey` FOREIGN KEY (`bulk_product_id`) REFERENCES `bulk_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_return_items` ADD CONSTRAINT `supplier_return_items_single_device_id_fkey` FOREIGN KEY (`single_device_id`) REFERENCES `single_devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
