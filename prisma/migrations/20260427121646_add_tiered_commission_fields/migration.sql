-- AlterTable
ALTER TABLE `commission_rules` ADD COLUMN `step_amount` DECIMAL(12, 2) NULL,
    ADD COLUMN `step_value` DECIMAL(12, 2) NULL,
    MODIFY `type` ENUM('PERCENTAGE', 'STATIC', 'TIERED') NOT NULL;
