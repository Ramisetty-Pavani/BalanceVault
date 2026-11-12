-- Prevent in-place changes to financial ledger and audit records.
CREATE TRIGGER `trg_ledger_entry_prevent_update`
BEFORE UPDATE ON `LedgerEntry`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'LedgerEntry is append-only';

CREATE TRIGGER `trg_ledger_entry_prevent_delete`
BEFORE DELETE ON `LedgerEntry`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'LedgerEntry is append-only';

CREATE TRIGGER `trg_audit_log_prevent_update`
BEFORE UPDATE ON `AuditLog`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';

CREATE TRIGGER `trg_audit_log_prevent_delete`
BEFORE DELETE ON `AuditLog`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';

-- Audit rows must keep their original actor reference when the actor still exists.
ALTER TABLE `AuditLog` DROP FOREIGN KEY `AuditLog_actorId_fkey`;
ALTER TABLE `AuditLog`
ADD CONSTRAINT `AuditLog_actorId_fkey`
FOREIGN KEY (`actorId`) REFERENCES `User`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;
