-- DEC-037: records that a candidate had no /rwa/price per-share benchmark, so
-- the reference-deviation check could not run. NOT NULL with a false default,
-- because "we did not check" must be a stated fact rather than a null that a
-- reader can mistake for "checked and fine".
ALTER TABLE execution.candidate_route
  ADD COLUMN reference_unavailable boolean NOT NULL DEFAULT false;
