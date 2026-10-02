-- F002 T4: the execution schema. Append-only with the SAME discipline as
-- evidence.*: no UPDATE, no DELETE, no TRUNCATE, RLS enabled, and orchard_app
-- granted SELECT and INSERT only. No exceptions (F002 T4).
--
-- evidence.reject_mutation() is owned by migration 001 and is reused verbatim
-- rather than forked, so there is one definition of append-only in the
-- database.

CREATE SCHEMA IF NOT EXISTS execution;

REVOKE ALL ON SCHEMA execution FROM orchard_app;
GRANT USAGE ON SCHEMA execution TO orchard_app;

-- One run of the engine: a ticker, a spend, and the policy that was in force.
-- The policy is stored as jsonb so a stored decision can always be re-read
-- against the exact configuration that produced it.
CREATE TABLE execution.execution_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_run_id uuid NOT NULL REFERENCES evidence.probe_run (id),
  underlying_ticker text NOT NULL,
  spend_asset_symbol text NOT NULL,
  spend_asset_address text NOT NULL,
  spend_amount_decimal numeric NOT NULL CHECK (spend_amount_decimal > 0),
  spend_amount_smallest_unit text NOT NULL,
  target_chain_id text NOT NULL,
  policy jsonb NOT NULL,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX execution_request_probe_run_id_idx ON execution.execution_request (probe_run_id);
CREATE INDEX execution_request_ticker_idx ON execution.execution_request (underlying_ticker);

-- One candidate representation considered for one request. Every candidate
-- links to the evidence.provider_call that produced its quote, so a reported
-- number can always be traced back to the exact provider response.
CREATE TABLE execution.candidate_route (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_request_id uuid NOT NULL REFERENCES execution.execution_request (id),
  provider_call_id uuid REFERENCES evidence.provider_call (id),
  representation_id text NOT NULL,
  platform_id text NOT NULL,
  token_contract_address text NOT NULL,
  binance_chain_id text NOT NULL,
  token_symbol text NOT NULL,
  -- Nullable because the three null-identity tokens from DEC-020 are recorded
  -- as rejected candidates, not dropped.
  asset_type smallint CHECK (asset_type IN (1, 2, 3)),
  asset_type_label text NOT NULL,
  token_to_share_ratio text NOT NULL,
  quote_provider text NOT NULL,
  quote_id text,
  input_amount_smallest_unit text NOT NULL,
  expected_output_token_amount text,
  to_token_decimals text,
  normalized_expected_shares numeric,
  effective_price_per_share numeric,
  reference_price numeric,
  reference_deviation_bps numeric,
  price_impact_bps numeric,
  trade_fee text,
  estimate_gas_fee text,
  execution_mode text,
  vendor_name text,
  quote_timestamp timestamptz,
  quote_age_seconds integer,
  eligibility text NOT NULL CHECK (eligibility IN ('ELIGIBLE', 'REJECTED')),
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- An ELIGIBLE candidate must have no reasons, and a REJECTED one must have at
  -- least one. Enforced here so a row can never claim a verdict it cannot
  -- justify.
  CONSTRAINT candidate_route_verdict_matches_reasons CHECK (
    (eligibility = 'ELIGIBLE' AND jsonb_array_length(rejection_reasons) = 0)
    OR (eligibility = 'REJECTED' AND jsonb_array_length(rejection_reasons) > 0)
  )
);

CREATE INDEX candidate_route_request_idx ON execution.candidate_route (execution_request_id);
CREATE INDEX candidate_route_provider_call_idx ON execution.candidate_route (provider_call_id);

-- The decision for one request. selected_candidate_id is NULL exactly when the
-- outcome is NO_ELIGIBLE_ROUTE - never a fallback, never a substitution.
CREATE TABLE execution.route_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_request_id uuid NOT NULL UNIQUE REFERENCES execution.execution_request (id),
  selected_candidate_id uuid REFERENCES execution.candidate_route (id),
  algorithm_version text NOT NULL,
  ranked_candidate_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text NOT NULL CHECK (outcome IN ('SELECTED', 'NO_ELIGIBLE_ROUTE')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_decision_outcome_matches_selection CHECK (
    (outcome = 'SELECTED' AND selected_candidate_id IS NOT NULL)
    OR (outcome = 'NO_ELIGIBLE_ROUTE' AND selected_candidate_id IS NULL)
  )
);

CREATE INDEX route_decision_request_idx ON execution.route_decision (execution_request_id);

ALTER TABLE execution.execution_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution.candidate_route ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution.route_decision ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_request_app_select ON execution.execution_request FOR SELECT TO orchard_app USING (true);
CREATE POLICY execution_request_app_insert ON execution.execution_request FOR INSERT TO orchard_app WITH CHECK (true);
CREATE POLICY candidate_route_app_select ON execution.candidate_route FOR SELECT TO orchard_app USING (true);
CREATE POLICY candidate_route_app_insert ON execution.candidate_route FOR INSERT TO orchard_app WITH CHECK (true);
CREATE POLICY route_decision_app_select ON execution.route_decision FOR SELECT TO orchard_app USING (true);
CREATE POLICY route_decision_app_insert ON execution.route_decision FOR INSERT TO orchard_app WITH CHECK (true);

GRANT SELECT, INSERT ON execution.execution_request TO orchard_app;
GRANT SELECT, INSERT ON execution.candidate_route TO orchard_app;
GRANT SELECT, INSERT ON execution.route_decision TO orchard_app;

CREATE TRIGGER execution_request_no_update
  BEFORE UPDATE ON execution.execution_request
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER execution_request_no_delete
  BEFORE DELETE ON execution.execution_request
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER execution_request_no_truncate
  BEFORE TRUNCATE ON execution.execution_request
  FOR EACH STATEMENT EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER candidate_route_no_update
  BEFORE UPDATE ON execution.candidate_route
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER candidate_route_no_delete
  BEFORE DELETE ON execution.candidate_route
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER candidate_route_no_truncate
  BEFORE TRUNCATE ON execution.candidate_route
  FOR EACH STATEMENT EXECUTE FUNCTION evidence.reject_mutation();

CREATE TRIGGER route_decision_no_update
  BEFORE UPDATE ON execution.route_decision
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER route_decision_no_delete
  BEFORE DELETE ON execution.route_decision
  FOR EACH ROW EXECUTE FUNCTION evidence.reject_mutation();
CREATE TRIGGER route_decision_no_truncate
  BEFORE TRUNCATE ON execution.route_decision
  FOR EACH STATEMENT EXECUTE FUNCTION evidence.reject_mutation();
