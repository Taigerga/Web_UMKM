/*
  Warnings:

  - Added the required column `file_path` to the `datasets` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `datasets` ADD COLUMN `file_path` VARCHAR(1024) NOT NULL;
