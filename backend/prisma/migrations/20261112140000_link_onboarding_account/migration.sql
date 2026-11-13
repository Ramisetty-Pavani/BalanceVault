-- AlterTable
ALTER TABLE `OnboardingRequest` ADD COLUMN `accountId` VARCHAR(30) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `OnboardingRequest_accountId_key` ON `OnboardingRequest`(`accountId`);

-- AddForeignKey
ALTER TABLE `OnboardingRequest` ADD CONSTRAINT `OnboardingRequest_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
