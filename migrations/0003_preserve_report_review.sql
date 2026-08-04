PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS reports_preserve_review_fields
AFTER UPDATE OF moderation_flags_json, operator_note, redacted_description ON reports
WHEN
  (NEW.moderation_flags_json = '[]' AND OLD.moderation_flags_json != '[]')
  OR (NEW.operator_note IS NULL AND OLD.operator_note IS NOT NULL)
  OR (NEW.redacted_description IS NULL AND OLD.redacted_description IS NOT NULL)
BEGIN
  UPDATE reports
  SET
    moderation_flags_json = CASE
      WHEN NEW.moderation_flags_json = '[]' AND OLD.moderation_flags_json != '[]' THEN OLD.moderation_flags_json
      ELSE NEW.moderation_flags_json
    END,
    operator_note = COALESCE(NEW.operator_note, OLD.operator_note),
    redacted_description = COALESCE(NEW.redacted_description, OLD.redacted_description)
  WHERE id = NEW.id;
END;
