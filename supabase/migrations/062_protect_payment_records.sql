-- Protect financial / 1099 tax records from accidental cascade deletion.
--
-- Before this migration, payments.musician_id and payments.service_id were
-- ON DELETE CASCADE. That meant deleting a musician — or deleting a project,
-- which cascades into its services — permanently destroyed every payment row,
-- including status='paid' records used for year-end 1099 reporting, with no
-- recovery path.
--
-- Switch both foreign keys to ON DELETE RESTRICT so the database itself refuses
-- to delete any musician or service that still has payment rows. The app now
-- archives (deactivates) such records instead of hard-deleting them.
--
-- payments.project_position_id stays ON DELETE SET NULL (unchanged) — losing the
-- position link does not destroy the financial record.

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_musician_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_musician_id_fkey
  FOREIGN KEY (musician_id) REFERENCES musicians(id) ON DELETE RESTRICT;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_service_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;
