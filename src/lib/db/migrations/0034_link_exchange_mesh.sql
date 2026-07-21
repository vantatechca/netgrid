-- Link exchange: full per-client mesh.
--
-- A client's sites now interlink as a complete graph (every site links to every
-- other site it owns), so a loop row represents one client's whole network. Add
-- client_id to link_exchange_loops so we can find/extend a client's mesh when
-- sites are added. Idempotent.

ALTER TABLE "link_exchange_loops"
  ADD COLUMN IF NOT EXISTS "client_id" uuid REFERENCES "clients"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "link_exchange_loops_client_idx"
  ON "link_exchange_loops" ("client_id");
