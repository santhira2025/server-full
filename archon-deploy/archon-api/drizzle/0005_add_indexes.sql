-- P0: Add indexes on most-queried columns
-- Every webhook event looks up org by installation_id
CREATE INDEX IF NOT EXISTS idx_organizations_installation_id ON organizations (installation_id);

-- SSE polls every 10s on these tables filtered by org_id + ordered by created_at
CREATE INDEX IF NOT EXISTS idx_event_logs_org_created ON event_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_results_org_created ON review_results (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_org_created ON tasks (org_id, created_at DESC);

-- Every review looks up developer profiles and learning events by org + login
CREATE INDEX IF NOT EXISTS idx_developer_profiles_org_login ON developer_profiles (org_id, github_login);
CREATE INDEX IF NOT EXISTS idx_learning_events_org_login ON learning_events (org_id, github_login);

-- Every auth check and dashboard load
CREATE INDEX IF NOT EXISTS idx_users_org ON users (org_id);
CREATE INDEX IF NOT EXISTS idx_repos_org ON repos (org_id);
