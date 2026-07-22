-- Migration: switch stores.accepted_waste_types to the e-waste categories.
--
-- `accepted_waste_types` is a MySQL SET column, so its members must be updated
-- for the new categories to be storable. createTables() in server.js only
-- applies to fresh databases, so run this ONCE against an existing database:
--
--   sudo mysql recycling_platform < backend/scripts/migrate-waste-categories.sql
--
-- Old and new members do not overlap, so existing selections are cleared first
-- (otherwise the SET bitmask would be reinterpreted into wrong values).
-- Recyclers re-select accepted categories from the new list afterwards.

UPDATE stores SET accepted_waste_types = NULL;

ALTER TABLE stores MODIFY accepted_waste_types SET(
  'Waste Batteries', 'PCB Scrap', 'Mobile Phone Scrap', 'Laptop Scrap',
  'Computer Scrap', 'Hard Drive Scrap', 'IT Equipment Scrap',
  'Telecom Equipment Scrap', 'Display Panel Scrap'
) NULL;
