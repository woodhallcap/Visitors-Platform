-- Hot paths: the no-show sweep and status filters (status first), and Today's log (check-in/out times as ranges).
CREATE INDEX idx_visits_status_date ON visits (status, visit_date);
CREATE INDEX idx_visits_checked_in_at ON visits (checked_in_at);
CREATE INDEX idx_visits_checked_out_at ON visits (checked_out_at);
