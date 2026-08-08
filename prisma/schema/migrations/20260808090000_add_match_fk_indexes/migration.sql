-- Match has FK columns without indexes; Postgres does not index FKs
-- automatically. The customer-ledger query counts matches per requirement
-- and per listing with correlated subqueries, which seq-scan "matches"
-- without these.

CREATE INDEX "matches_buyer_req_id_idx" ON "matches" ("buyer_req_id");

CREATE INDEX "matches_listing_id_idx" ON "matches" ("listing_id");
