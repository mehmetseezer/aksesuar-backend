-- AlterTable
ALTER TABLE `employees` ADD COLUMN `advance_balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `commission_balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `salary` DECIMAL(12, 2) NOT NULL DEFAULT 0;
