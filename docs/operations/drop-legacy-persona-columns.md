# Drop Legacy Persona Analysis Columns

Use this only after the API version that no longer reads or writes legacy persona analysis columns is deployed and healthy.

## Backup

```sql
CREATE TABLE personas_legacy_analysis_backup_YYYYMMDDHHMMSS AS
SELECT
  id,
  user_id,
  summary,
  language_style,
  personality_traits,
  values_beliefs,
  knowledge_domains,
  emotional_patterns,
  decision_style,
  analysis_metadata,
  last_analyzed_at,
  created_at,
  updated_at
FROM personas;
```

## Drop

```sql
ALTER TABLE personas
  DROP COLUMN IF EXISTS summary,
  DROP COLUMN IF EXISTS language_style,
  DROP COLUMN IF EXISTS personality_traits,
  DROP COLUMN IF EXISTS values_beliefs,
  DROP COLUMN IF EXISTS knowledge_domains,
  DROP COLUMN IF EXISTS emotional_patterns,
  DROP COLUMN IF EXISTS decision_style,
  DROP COLUMN IF EXISTS analysis_metadata;
```

## Verify

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'personas'
  AND column_name IN (
    'summary',
    'language_style',
    'personality_traits',
    'values_beliefs',
    'knowledge_domains',
    'emotional_patterns',
    'decision_style',
    'analysis_metadata'
  );
```

The verify query should return zero rows. Keep `last_analyzed_at`; it still drives the analysis cooldown.
