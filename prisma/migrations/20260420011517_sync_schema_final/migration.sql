-- AlterTable
ALTER TABLE `commission_rules` ADD COLUMN `employee_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `new_products` MODIFY `model` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `used_products` ADD COLUMN `condition_note` TEXT NULL;

-- CreateIndex
CREATE INDEX `commission_rules_employee_id_idx` ON `commission_rules`(`employee_id`);

-- AddForeignKey
ALTER TABLE `commission_rules` ADD CONSTRAINT `commission_rules_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
