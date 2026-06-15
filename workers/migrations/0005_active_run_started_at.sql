-- Track whether the current agent turn is still open.

ALTER TABLE sessions ADD COLUMN active_run_started_at TEXT;

UPDATE sessions
SET
    active_run_started_at = (
        SELECT MAX(e.event_time)
        FROM events e
        WHERE e.session_id = sessions.session_id
          AND e.user_id = sessions.user_id
          AND e.event_type = 'message.started'
    ),
    current_run_started_at = COALESCE(
        (
            SELECT MAX(e.event_time)
            FROM events e
            WHERE e.session_id = sessions.session_id
              AND e.user_id = sessions.user_id
              AND e.event_type = 'message.started'
        ),
        current_run_started_at
    )
WHERE latest_event_type NOT IN ('message.finished', 'session.completed', 'session.failed', 'session.aborted')
  AND last_event_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')
  AND (
      SELECT MAX(e.event_time)
      FROM events e
      WHERE e.session_id = sessions.session_id
        AND e.user_id = sessions.user_id
        AND e.event_type = 'message.started'
  ) IS NOT NULL
  AND (
      SELECT MAX(e.event_time)
      FROM events e
      WHERE e.session_id = sessions.session_id
        AND e.user_id = sessions.user_id
        AND e.event_type = 'message.started'
  ) > COALESCE(
      (
          SELECT MAX(e.event_time)
          FROM events e
          WHERE e.session_id = sessions.session_id
            AND e.user_id = sessions.user_id
            AND e.event_type = 'message.finished'
      ),
      ''
  );
