-- wouldkeep P1B: one idempotent, optimistic, all-or-nothing editor snapshot save.
-- Hard deployment prerequisite: 20260722000100_site_owner_role_invariant.sql from
-- the workspace-admin-retirement slice must already be merged, deployed, verified,
-- and the production migration ledger must be at zero pending. Never deploy this
-- 20260722000200 migration out of order. The prerequisite stays in its own PR.

-- Fail quickly instead of queuing production writes behind a conflicting lock, and
-- bound every catalog/data scan in this migration. Successful completion restores
-- the session defaults explicitly; an error aborts the migration transaction.
SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $$
BEGIN
  IF to_regprocedure('public.grant_role(uuid,text,text)') IS NULL
    OR pg_get_functiondef('public.grant_role(uuid,text,text)'::REGPROCEDURE)
      NOT LIKE '%public.is_site_owner(target_uid)%'
  THEN
    RAISE EXCEPTION
      '20260722000100 site-owner invariant is not deployed; do not apply 20260722000200 out of order'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- Fail before changing the schema if current production data cannot be represented by
-- this versioned RPC contract. This is deliberately not a lossy cleanup migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.documents document
    WHERE char_length(document.topic) > 160
      OR char_length(document.body) > 1000000
      OR octet_length(convert_to(document.body, 'UTF8')) > 4000000
  ) THEN
    RAISE EXCEPTION
      'atomic save preflight found a document above the v1 topic/body limit; review before retrying'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.document_tags document_tag
    GROUP BY document_tag.document_id
    HAVING count(*) > 100
  ) OR EXISTS (
    SELECT 1
    FROM public.document_links link
    WHERE link.relation_type IN ('prerequisite', 'related')
    GROUP BY link.from_document_id, link.relation_type
    HAVING count(*) > 100
  ) OR EXISTS (
    SELECT 1
    FROM public.document_sources source
    GROUP BY source.document_id
    HAVING count(*) > 50
  ) THEN
    RAISE EXCEPTION
      'atomic save preflight found organization data above a v1 array limit; review before retrying'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    WHERE tag.name <> regexp_replace(
        btrim(normalize(tag.name, NFKC)),
        '[[:space:]]+',
        ' ',
        'g'
      )
      OR tag.normalized_name <> lower(regexp_replace(
        btrim(normalize(tag.name, NFKC)),
        '[[:space:]]+',
        ' ',
        'g'
      ))
      OR tag.name ~ '^[[:punct:][:space:]]+$'
  ) THEN
    RAISE EXCEPTION
      'atomic save preflight found a tag outside the v1 NFKC/whitespace/lowercase contract; review before retrying'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    LEFT JOIN public.knowledge_bases knowledge_base
      ON knowledge_base.id = tag.knowledge_base_id
     AND knowledge_base.owner_id = tag.owner_id
    WHERE knowledge_base.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'atomic save preflight found a tag whose owner differs from its knowledge-base owner; review before retrying'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documents document
    JOIN public.knowledge_bases knowledge_base
      ON knowledge_base.id = document.knowledge_base_id
    WHERE document.owner_id <> knowledge_base.owner_id
      OR document.revision > 9007199254740990
  ) OR EXISTS (
    SELECT 1
    FROM public.document_versions version
    JOIN public.documents document ON document.id = version.document_id
    WHERE version.owner_id <> document.owner_id
      OR version.created_by <> document.owner_id
      OR version.version_no > document.revision
  ) THEN
    RAISE EXCEPTION
      'atomic save preflight found invalid owner/revision history or no JS-safe next revision; review before retrying'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.document_tags document_tag
    JOIN public.documents document ON document.id = document_tag.document_id
    JOIN public.tags tag ON tag.id = document_tag.tag_id
    WHERE document_tag.owner_id <> document.owner_id
      OR document_tag.owner_id <> tag.owner_id
      OR document.knowledge_base_id <> tag.knowledge_base_id
  ) OR EXISTS (
    SELECT 1
    FROM public.document_sources source
    JOIN public.documents document ON document.id = source.document_id
    WHERE source.owner_id <> document.owner_id
  ) OR EXISTS (
    SELECT 1
    FROM public.document_links link
    JOIN public.documents source_document ON source_document.id = link.from_document_id
    JOIN public.documents target_document ON target_document.id = link.to_document_id
    WHERE link.owner_id <> source_document.owner_id
      OR link.owner_id <> target_document.owner_id
      OR source_document.knowledge_base_id <> target_document.knowledge_base_id
  ) THEN
    RAISE EXCEPTION
      'atomic save preflight found cross-owner or cross-knowledge-base organization rows; review before retrying'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger trigger
    JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'document_links'
      AND trigger.tgname = 'document_links_require_valid_endpoints'
      AND NOT trigger.tgisinternal
      AND trigger.tgenabled = 'O'
      AND pg_catalog.pg_get_triggerdef(trigger.oid) LIKE
        '%BEFORE INSERT OR UPDATE ON public.document_links%'
  ) <> 1 THEN
    RAISE EXCEPTION
      'atomic save preflight requires the enabled 20260721000100 document-link endpoint trigger'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regnamespace('wouldkeep_private') IS NOT NULL THEN
    RAISE EXCEPTION
      'wouldkeep_private already exists; inspect its owner and objects before applying this security boundary'
      USING ERRCODE = 'duplicate_schema';
  END IF;

  IF to_regprocedure(
    'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'save_document_snapshot_v1 already exists; inspect it before applying this migration'
      USING ERRCODE = 'duplicate_function';
  END IF;

  IF COALESCE(current_setting('pgrst.db_schemas', TRUE), '')
      ~* '(^|[, =])wouldkeep_private([, ]|$)'
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles role,
           LATERAL unnest(COALESCE(role.rolconfig, ARRAY[]::TEXT[])) config(value)
      WHERE config.value ~* '^pgrst\.db_schemas='
        AND config.value ~* '(^|[, =])wouldkeep_private([, ]|$)'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_db_role_setting setting,
           LATERAL unnest(COALESCE(setting.setconfig, ARRAY[]::TEXT[])) config(value)
      WHERE config.value ~* '^pgrst\.db_schemas='
        AND config.value ~* '(^|[, =])wouldkeep_private([, ]|$)'
    )
  THEN
    RAISE EXCEPTION
      'wouldkeep_private is configured as a PostgREST exposed schema; remove it before applying this migration'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- Enforce the account boundary in both directions with native referential integrity.
-- The composite FK blocks cross-account tag inserts/updates, while ON UPDATE RESTRICT
-- also prevents a knowledge-base owner change from stranding existing tags. The
-- existing single-column FK continues to document the base relationship; both FKs
-- intentionally cascade tag deletion when the knowledge base is deleted.
ALTER TABLE public.knowledge_bases
  ADD CONSTRAINT knowledge_bases_id_owner_unique
  UNIQUE (id, owner_id);

ALTER TABLE public.tags
  ADD CONSTRAINT tags_knowledge_base_owner_fkey
  FOREIGN KEY (knowledge_base_id, owner_id)
  REFERENCES public.knowledge_bases(id, owner_id)
  ON UPDATE RESTRICT
  ON DELETE CASCADE
  NOT DEFERRABLE;

-- Receipts intentionally live outside every Supabase/PostgREST exposed schema. The
-- strict SECURITY DEFINER RPC is the only writer/reader: application roles receive no
-- schema or table ACL at all. Production preflight must also verify that
-- wouldkeep_private is absent from pgrst.db_schemas / the Dashboard exposed list.
CREATE SCHEMA wouldkeep_private;

REVOKE ALL ON SCHEMA wouldkeep_private
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION wouldkeep_private.percent_decode_url_component(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  decoded BYTEA := ''::BYTEA;
  cursor_position INTEGER := 1;
  current_character TEXT;
  hex_pair TEXT;
BEGIN
  WHILE cursor_position <= char_length(p_value)
  LOOP
    current_character := substring(p_value FROM cursor_position FOR 1);
    hex_pair := substring(p_value FROM cursor_position + 1 FOR 2);
    IF current_character = '%' AND hex_pair ~ '^[0-9A-Fa-f]{2}$' THEN
      decoded := decoded || decode(hex_pair, 'hex');
      cursor_position := cursor_position + 3;
    ELSE
      decoded := decoded || convert_to(
        CASE WHEN current_character = '+' THEN ' ' ELSE current_character END,
        'UTF8'
      );
      cursor_position := cursor_position + 1;
    END IF;
  END LOOP;

  BEGIN
    RETURN convert_from(decoded, 'UTF8');
  EXCEPTION WHEN character_not_in_repertoire THEN
    RETURN p_value;
  END;
END;
$$;

CREATE FUNCTION wouldkeep_private.source_url_has_secret(p_url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  query_part TEXT := '';
  fragment_part TEXT := '';
  raw_parameter TEXT;
  decoded_key TEXT;
BEGIN
  IF strpos(p_url, '?') > 0 THEN
    query_part := split_part(split_part(p_url, '?', 2), '#', 1);
  END IF;
  IF strpos(p_url, '#') > 0 THEN
    fragment_part := split_part(p_url, '#', 2);
    IF strpos(fragment_part, '?') > 0 THEN
      fragment_part := split_part(fragment_part, '?', 2);
    END IF;
  END IF;

  FOREACH raw_parameter IN ARRAY string_to_array(query_part || '&' || fragment_part, '&')
  LOOP
    decoded_key := lower(wouldkeep_private.percent_decode_url_component(
      split_part(raw_parameter, '=', 1)
    ));
    IF decoded_key ~ '^(token|access[_-]?token|auth|authorization|password|passcode|session|api[_-]?key|key|signature|sig|x-amz-signature)$' THEN
      RETURN TRUE;
    END IF;
  END LOOP;
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION wouldkeep_private.percent_decode_url_component(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION wouldkeep_private.source_url_has_secret(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.document_sources source
    WHERE source.title <> btrim(source.title)
      OR source.author <> btrim(source.author)
      OR source.note <> btrim(source.note)
      OR (
        source.kind = 'personal'
        AND (source.url IS NOT NULL OR btrim(source.title) = '')
      )
      OR (
        source.kind = 'web'
        AND (
          source.url IS NULL
          OR source.url <> btrim(source.url)
          OR source.url !~* '^https?://[^[:space:]]+$'
          OR source.url ~* '^https?://[^/@[:space:]]+@'
          OR wouldkeep_private.source_url_has_secret(source.url)
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT
        source.document_id,
        regexp_replace(source.url, '#.*$', '') AS url_without_fragment
      FROM public.document_sources source
      WHERE source.kind = 'web'
      GROUP BY source.document_id, regexp_replace(source.url, '#.*$', '')
      HAVING count(*) > 1
    ) duplicate
  ) THEN
    RAISE EXCEPTION
      'atomic save preflight found source data outside the v1 canonical/sensitive-url contract; review before retrying'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE TABLE wouldkeep_private.document_save_receipts (
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_version SMALLINT NOT NULL DEFAULT 1 CHECK (result_version = 1),
  -- Do not cascade receipts on a single-document hard delete. A delayed replay of
  -- a successfully created document still carries p_document_id = NULL; retaining
  -- its receipt prevents that lost acknowledgement from creating a duplicate.
  document_id UUID NOT NULL,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
  created BOOLEAN NOT NULL,
  resulting_revision BIGINT NOT NULL CHECK (resulting_revision >= 0),
  response JSONB NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, operation_id),
  CONSTRAINT document_save_receipts_operation_id_format CHECK (
    operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  CONSTRAINT document_save_receipts_hash_format CHECK (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT document_save_receipts_response_status CHECK (
    (
      jsonb_typeof(response) = 'object'
      AND response->'status' = '"saved"'::JSONB
      AND response->'result_version' = to_jsonb(result_version)
      AND response->'operation_id' = to_jsonb(operation_id)
      AND response->'knowledge_base_id' = to_jsonb(knowledge_base_id)
      AND response->'created' = to_jsonb(created)
      AND response->'saved_at' = to_jsonb(saved_at)
    ) IS TRUE
  ),
  CONSTRAINT document_save_receipts_response_identity CHECK (
    (
      response->'document_id' = to_jsonb(document_id)
      AND response->'revision' = to_jsonb(resulting_revision)
    ) IS TRUE
  ),
  CONSTRAINT document_save_receipts_response_exact_keys CHECK (
    (
      response ?& ARRAY[
        'result_version', 'status', 'operation_id', 'document_id',
        'knowledge_base_id', 'revision', 'created', 'saved_at'
      ]
      AND response - ARRAY[
        'result_version', 'status', 'operation_id', 'document_id',
        'knowledge_base_id', 'revision', 'created', 'saved_at'
      ]::TEXT[] = '{}'::JSONB
    ) IS TRUE
  )
);

ALTER TABLE wouldkeep_private.document_save_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE wouldkeep_private.document_save_receipts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION wouldkeep_private.require_valid_document_save_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM public.documents document
  WHERE document.id = NEW.document_id
    AND document.owner_id = NEW.owner_id
    AND document.knowledge_base_id = NEW.knowledge_base_id
    AND document.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'a saved receipt requires a matching live owner document'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION wouldkeep_private.require_valid_document_save_receipt()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER document_save_receipts_require_valid_owner_document
  BEFORE INSERT
  ON wouldkeep_private.document_save_receipts
  FOR EACH ROW
  EXECUTE FUNCTION wouldkeep_private.require_valid_document_save_receipt();

CREATE FUNCTION public.save_document_snapshot_v1(
  p_operation_id TEXT,
  p_document_id UUID,
  p_knowledge_base_id UUID,
  p_expected_revision BIGINT,
  p_snapshot JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor_id UUID := auth.uid();
  request_hash TEXT;
  receipt wouldkeep_private.document_save_receipts%ROWTYPE;
  response JSONB;
  source_document public.documents%ROWTYPE;
  target_document public.documents%ROWTYPE;
  saved_document_id UUID;
  saved_revision BIGINT;
  snapshot_key TEXT;
  value JSONB;
  value_index INTEGER;
  canonical_value TEXT;
  normalized_value TEXT;
  tag_names TEXT[] := ARRAY[]::TEXT[];
  tag_keys TEXT[] := ARRAY[]::TEXT[];
  prerequisite_ids UUID[] := ARRAY[]::UUID[];
  related_ids UUID[] := ARRAY[]::UUID[];
  relation_field TEXT;
  relation_ids UUID[];
  relation_type_value TEXT;
  target_id UUID;
  tag_index INTEGER;
  tag_id UUID;
  source_value JSONB;
  source_index INTEGER;
  source_kind TEXT;
  source_url TEXT;
  source_title TEXT;
  source_author TEXT;
  source_note TEXT;
  canonical_sources JSONB := '[]'::JSONB;
  canonical_snapshot JSONB;
  receipt_saved_at TIMESTAMPTZ;
  is_created BOOLEAN;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_operation_id IS NULL
    OR p_operation_id <> btrim(p_operation_id)
    OR p_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  THEN
    RAISE EXCEPTION 'operation_id is invalid' USING ERRCODE = '22023';
  END IF;

  IF p_knowledge_base_id IS NULL THEN
    RAISE EXCEPTION 'knowledge_base_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_expected_revision IS NULL
    OR p_expected_revision < 0
    OR p_expected_revision > 9007199254740990
  THEN
    RAISE EXCEPTION 'expected_revision must allow a JS-safe next revision'
      USING ERRCODE = '22023';
  END IF;

  IF p_document_id IS NULL AND p_expected_revision <> 0 THEN
    RAISE EXCEPTION 'a new document must use expected_revision 0'
      USING ERRCODE = '22023';
  END IF;

  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'snapshot must be a JSON object' USING ERRCODE = '22023';
  END IF;

  FOREACH snapshot_key IN ARRAY ARRAY[
    'title', 'body', 'topic', 'maturity', 'visibility',
    'tags', 'prerequisites', 'related', 'sources'
  ]
  LOOP
    IF NOT (p_snapshot ? snapshot_key) THEN
      RAISE EXCEPTION 'snapshot is missing required field: %', snapshot_key
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_snapshot) AS provided(key)
    WHERE provided.key <> ALL (ARRAY[
      'title', 'body', 'topic', 'maturity', 'visibility',
      'tags', 'prerequisites', 'related', 'sources'
    ]::TEXT[])
  ) THEN
    RAISE EXCEPTION 'snapshot contains an unsupported field'
      USING ERRCODE = '22023';
  END IF;

  FOREACH snapshot_key IN ARRAY ARRAY[
    'title', 'body', 'topic', 'maturity', 'visibility'
  ]
  LOOP
    IF jsonb_typeof(p_snapshot->snapshot_key) <> 'string' THEN
      RAISE EXCEPTION 'snapshot.% must be a string', snapshot_key
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH snapshot_key IN ARRAY ARRAY[
    'tags', 'prerequisites', 'related', 'sources'
  ]
  LOOP
    IF jsonb_typeof(p_snapshot->snapshot_key) <> 'array' THEN
      RAISE EXCEPTION 'snapshot.% must be an array', snapshot_key
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF char_length(p_snapshot->>'title') > 160 THEN
    RAISE EXCEPTION 'snapshot.title exceeds 160 characters' USING ERRCODE = '22023';
  END IF;

  IF char_length(p_snapshot->>'topic') > 160 THEN
    RAISE EXCEPTION 'snapshot.topic exceeds 160 characters' USING ERRCODE = '22023';
  END IF;

  IF char_length(p_snapshot->>'body') > 1000000
    OR octet_length(convert_to(p_snapshot->>'body', 'UTF8')) > 4000000
  THEN
    RAISE EXCEPTION 'snapshot.body exceeds the v1 character or UTF-8 byte limit'
      USING ERRCODE = '22023';
  END IF;

  IF octet_length(convert_to(p_snapshot::TEXT, 'UTF8')) > 5000000 THEN
    RAISE EXCEPTION 'snapshot exceeds the 5000000-byte v1 request limit'
      USING ERRCODE = '22023';
  END IF;

  IF p_snapshot->>'maturity' NOT IN ('seed', 'growing', 'stable') THEN
    RAISE EXCEPTION 'snapshot.maturity is invalid' USING ERRCODE = '22023';
  END IF;

  IF p_snapshot->>'visibility' NOT IN ('private', 'unlisted', 'public') THEN
    RAISE EXCEPTION 'snapshot.visibility is invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_snapshot->'tags') > 100 THEN
    RAISE EXCEPTION 'snapshot.tags contains more than 100 entries'
      USING ERRCODE = '22023';
  END IF;

  FOR value, value_index IN
    SELECT item.value, item.ordinality::INTEGER
    FROM jsonb_array_elements(p_snapshot->'tags') WITH ORDINALITY AS item(value, ordinality)
  LOOP
    IF jsonb_typeof(value) <> 'string' THEN
      RAISE EXCEPTION 'snapshot.tags[%] must be a string', value_index - 1
        USING ERRCODE = '22023';
    END IF;
    canonical_value := regexp_replace(
      btrim(normalize(value #>> '{}', NFKC)),
      '[[:space:]]+',
      ' ',
      'g'
    );
    IF canonical_value = '' THEN
      RAISE EXCEPTION 'snapshot.tags[%] must be nonempty text', value_index - 1
        USING ERRCODE = '22023';
    END IF;
    IF char_length(canonical_value) > 80 THEN
      RAISE EXCEPTION 'snapshot.tags[%] exceeds 80 characters', value_index - 1
        USING ERRCODE = '22023';
    END IF;
    IF canonical_value ~ '^[[:punct:][:space:]]+$' THEN
      RAISE EXCEPTION 'snapshot.tags[%] cannot contain punctuation only', value_index - 1
        USING ERRCODE = '22023';
    END IF;
    normalized_value := lower(canonical_value);
    IF normalized_value = ANY(tag_keys) THEN
      RAISE EXCEPTION 'snapshot.tags contains a duplicate normalized tag'
        USING ERRCODE = '22023';
    END IF;
    tag_names := array_append(tag_names, canonical_value);
    tag_keys := array_append(tag_keys, normalized_value);
  END LOOP;

  FOREACH relation_field IN ARRAY ARRAY['prerequisites', 'related']
  LOOP
    IF jsonb_array_length(p_snapshot->relation_field) > 100 THEN
      RAISE EXCEPTION 'snapshot.% contains more than 100 entries', relation_field
        USING ERRCODE = '22023';
    END IF;
    relation_ids := ARRAY[]::UUID[];
    FOR value, value_index IN
      SELECT item.value, item.ordinality::INTEGER
      FROM jsonb_array_elements(p_snapshot->relation_field)
        WITH ORDINALITY AS item(value, ordinality)
    LOOP
      IF jsonb_typeof(value) <> 'string'
        OR (value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'snapshot.%[%] must be a UUID', relation_field, value_index - 1
          USING ERRCODE = '22023';
      END IF;
      target_id := (value #>> '{}')::UUID;
      IF p_document_id IS NOT NULL AND target_id = p_document_id THEN
        RAISE EXCEPTION 'a document cannot relate to itself' USING ERRCODE = '22023';
      END IF;
      IF target_id = ANY(relation_ids) THEN
        RAISE EXCEPTION 'snapshot.% contains a duplicate document', relation_field
          USING ERRCODE = '22023';
      END IF;
      relation_ids := array_append(relation_ids, target_id);
    END LOOP;
    IF relation_field = 'prerequisites' THEN
      prerequisite_ids := relation_ids;
    ELSE
      related_ids := relation_ids;
    END IF;
  END LOOP;

  IF jsonb_array_length(p_snapshot->'sources') > 50 THEN
    RAISE EXCEPTION 'snapshot.sources contains more than 50 entries'
      USING ERRCODE = '22023';
  END IF;

  FOR source_value, source_index IN
    SELECT item.value, item.ordinality::INTEGER
    FROM jsonb_array_elements(p_snapshot->'sources')
      WITH ORDINALITY AS item(value, ordinality)
  LOOP
    IF jsonb_typeof(source_value) <> 'object' THEN
      RAISE EXCEPTION 'snapshot.sources[%] must be an object', source_index - 1
        USING ERRCODE = '22023';
    END IF;
    FOREACH snapshot_key IN ARRAY ARRAY['kind', 'url', 'title', 'author', 'note']
    LOOP
      IF NOT (source_value ? snapshot_key) THEN
        RAISE EXCEPTION 'snapshot.sources[%] is missing field: %', source_index - 1, snapshot_key
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1
      FROM jsonb_object_keys(source_value) AS provided(key)
      WHERE provided.key <> ALL (ARRAY['kind', 'url', 'title', 'author', 'note']::TEXT[])
    ) THEN
      RAISE EXCEPTION 'snapshot.sources[%] contains an unsupported field', source_index - 1
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(source_value->'kind') <> 'string'
      OR jsonb_typeof(source_value->'title') <> 'string'
      OR jsonb_typeof(source_value->'author') <> 'string'
      OR jsonb_typeof(source_value->'note') <> 'string'
    THEN
      RAISE EXCEPTION 'snapshot.sources[%] contains a non-string text field', source_index - 1
        USING ERRCODE = '22023';
    END IF;
    source_kind := source_value->>'kind';
    IF jsonb_typeof(source_value->'url') <> 'string' THEN
      RAISE EXCEPTION 'snapshot.sources[%].url must be a string', source_index - 1
        USING ERRCODE = '22023';
    END IF;
    source_url := source_value->>'url';
    source_title := source_value->>'title';
    source_author := source_value->>'author';
    source_note := source_value->>'note';
    IF source_kind NOT IN ('web', 'personal') THEN
      RAISE EXCEPTION 'snapshot.sources[%].kind is invalid', source_index - 1
        USING ERRCODE = '22023';
    END IF;
    IF char_length(source_title) > 240
      OR char_length(source_author) > 160
      OR char_length(source_note) > 1000
    THEN
      RAISE EXCEPTION 'snapshot.sources[%] exceeds a text limit', source_index - 1
        USING ERRCODE = '22023';
    END IF;
    IF source_title <> btrim(source_title)
      OR source_author <> btrim(source_author)
      OR source_note <> btrim(source_note)
      OR (source_url IS NOT NULL AND source_url <> btrim(source_url))
    THEN
      RAISE EXCEPTION 'snapshot.sources[%] must use canonical trimmed text', source_index - 1
        USING ERRCODE = '22023';
    END IF;
    IF source_kind = 'personal' AND (source_url <> '' OR btrim(source_title) = '') THEN
      RAISE EXCEPTION 'a personal source requires a title and an empty url'
        USING ERRCODE = '22023';
    END IF;
    IF source_kind = 'web' AND (
      source_url IS NULL
      OR char_length(source_url) > 2048
      OR source_url !~* '^https?://[^[:space:]]+$'
      OR source_url ~* '^https?://[^/@[:space:]]+@'
      OR wouldkeep_private.source_url_has_secret(source_url)
    ) THEN
      RAISE EXCEPTION 'a web source requires a safe HTTP(S) url'
        USING ERRCODE = '22023';
    END IF;
    canonical_sources := canonical_sources || jsonb_build_array(jsonb_build_object(
      'kind', source_kind,
      'url', CASE WHEN source_kind = 'web' THEN source_url ELSE NULL END,
      'title', source_title,
      'author', source_author,
      'note', source_note
    ));
  END LOOP;

  IF (
    SELECT count(*)
    FROM (
      SELECT regexp_replace(source.value->>'url', '#.*$', '') AS url
      FROM jsonb_array_elements(p_snapshot->'sources') AS source(value)
      WHERE source.value->>'kind' = 'web'
      GROUP BY regexp_replace(source.value->>'url', '#.*$', '')
      HAVING count(*) > 1
    ) duplicate
  ) > 0 THEN
    RAISE EXCEPTION 'snapshot.sources contains a duplicate web url'
      USING ERRCODE = '22023';
  END IF;

  canonical_snapshot := jsonb_build_object(
    'title', p_snapshot->>'title',
    'body', p_snapshot->>'body',
    'topic', p_snapshot->>'topic',
    'maturity', p_snapshot->>'maturity',
    'visibility', p_snapshot->>'visibility',
    'tags', to_jsonb(tag_names),
    'prerequisites', to_jsonb(prerequisite_ids),
    'related', to_jsonb(related_ids),
    'sources', canonical_sources
  );

  request_hash := encode(
    sha256(convert_to(jsonb_build_object(
      'document_id', p_document_id,
      'knowledge_base_id', p_knowledge_base_id,
      'expected_revision', p_expected_revision,
      'snapshot', canonical_snapshot
    )::TEXT, 'UTF8')),
    'hex'
  );

  -- One owner lock makes receipt lookup/creation and new-document acknowledgement
  -- idempotent even when two tabs replay the same operation concurrently.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor_id::TEXT, 872611));

  SELECT * INTO receipt
  FROM wouldkeep_private.document_save_receipts existing_receipt
  WHERE existing_receipt.owner_id = actor_id
    AND existing_receipt.operation_id = p_operation_id;

  IF FOUND THEN
    IF receipt.request_hash <> request_hash THEN
      RAISE EXCEPTION 'operation_id_reused' USING ERRCODE = '22023';
    END IF;
    RETURN receipt.response;
  END IF;

  receipt_saved_at := clock_timestamp();

  PERFORM 1
  FROM public.knowledge_bases knowledge_base
  WHERE knowledge_base.id = p_knowledge_base_id
    AND knowledge_base.owner_id = actor_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    response := jsonb_build_object(
      'result_version', 1,
      'status', 'not_found',
      'operation_id', p_operation_id,
      'knowledge_base_id', p_knowledge_base_id,
      'created', FALSE,
      'saved_at', NULL
    );
    RETURN response;
  END IF;

  IF p_document_id IS NOT NULL THEN
    SELECT * INTO source_document
    FROM public.documents document
    WHERE document.id = p_document_id
      AND document.owner_id = actor_id
      AND document.knowledge_base_id = p_knowledge_base_id
      AND document.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      response := jsonb_build_object(
        'result_version', 1,
        'status', 'not_found',
        'operation_id', p_operation_id,
        'knowledge_base_id', p_knowledge_base_id,
        'created', FALSE,
        'saved_at', NULL
      );
      RETURN response;
    END IF;

    IF source_document.revision > 9007199254740990 THEN
      RAISE EXCEPTION 'document revision cannot advance within the JS-safe integer range'
        USING ERRCODE = '22023';
    END IF;

    IF source_document.revision <> p_expected_revision THEN
      response := jsonb_build_object(
        'result_version', 1,
        'status', 'conflict',
        'operation_id', p_operation_id,
        'document_id', source_document.id,
        'knowledge_base_id', p_knowledge_base_id,
        'expected_revision', p_expected_revision,
        'current_revision', source_document.revision,
        'created', FALSE,
        'saved_at', NULL
      );
      RETURN response;
    END IF;
  END IF;

  -- Live relation targets may be newly linked. A deleted target is accepted only
  -- when this exact owner/document/type link already exists, allowing the caller
  -- to retain or remove a visible tombstone without recreating one.
  FOREACH relation_field IN ARRAY ARRAY['prerequisites', 'related']
  LOOP
    relation_type_value := CASE
      WHEN relation_field = 'prerequisites' THEN 'prerequisite'
      ELSE 'related'
    END;
    relation_ids := CASE
      WHEN relation_field = 'prerequisites' THEN prerequisite_ids
      ELSE related_ids
    END;
    FOREACH target_id IN ARRAY relation_ids
    LOOP
      SELECT * INTO target_document
      FROM public.documents document
      WHERE document.id = target_id
        AND document.owner_id = actor_id
        AND document.knowledge_base_id = p_knowledge_base_id
      FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'snapshot.% contains an unavailable document', relation_field
          USING ERRCODE = '22023';
      END IF;

      IF target_document.deleted_at IS NOT NULL AND (
        p_document_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.document_links existing_link
          WHERE existing_link.from_document_id = p_document_id
            AND existing_link.to_document_id = target_id
            AND existing_link.owner_id = actor_id
            AND existing_link.relation_type = relation_type_value
        )
      ) THEN
        RAISE EXCEPTION 'snapshot.% cannot create a deleted-target relationship', relation_field
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  IF p_document_id IS NULL THEN
    is_created := TRUE;
    INSERT INTO public.documents (
      knowledge_base_id,
      owner_id,
      title,
      body,
      topic,
      maturity,
      status,
      visibility
    ) VALUES (
      p_knowledge_base_id,
      actor_id,
      p_snapshot->>'title',
      p_snapshot->>'body',
      p_snapshot->>'topic',
      p_snapshot->>'maturity',
      'draft',
      p_snapshot->>'visibility'
    )
    RETURNING * INTO source_document;
  ELSE
    is_created := FALSE;
    UPDATE public.documents document
    SET title = p_snapshot->>'title',
        body = p_snapshot->>'body',
        topic = p_snapshot->>'topic',
        maturity = p_snapshot->>'maturity',
        status = CASE
          WHEN source_document.status = 'published' THEN 'published'
          ELSE 'draft'
        END,
        visibility = p_snapshot->>'visibility',
        revision = document.revision + 1
    WHERE document.id = source_document.id
      AND document.owner_id = actor_id
      AND document.knowledge_base_id = p_knowledge_base_id
      AND document.revision = p_expected_revision
      AND document.deleted_at IS NULL
    RETURNING * INTO source_document;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'document changed while the save lock was held'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  saved_document_id := source_document.id;
  saved_revision := source_document.revision;

  DELETE FROM public.document_tags document_tag
  WHERE document_tag.document_id = saved_document_id
    AND document_tag.owner_id = actor_id;

  IF cardinality(tag_names) > 0 THEN
    FOR tag_index IN 1..cardinality(tag_names)
    LOOP
      tag_id := NULL;
      INSERT INTO public.tags (
        knowledge_base_id, owner_id, name, normalized_name
      ) VALUES (
        p_knowledge_base_id, actor_id, tag_names[tag_index], tag_keys[tag_index]
      )
      ON CONFLICT (knowledge_base_id, normalized_name) DO UPDATE
      SET name = EXCLUDED.name
      WHERE public.tags.owner_id = actor_id
      RETURNING id INTO tag_id;

      IF tag_id IS NULL THEN
        RAISE EXCEPTION 'an existing tag violates owner isolation'
          USING ERRCODE = '42501';
      END IF;

      INSERT INTO public.document_tags (document_id, tag_id, owner_id)
      VALUES (saved_document_id, tag_id, actor_id);
    END LOOP;
  END IF;

  -- Only prerequisite/related are synchronized. `continues` is intentionally
  -- outside this snapshot and remains byte-for-byte untouched.
  DELETE FROM public.document_links link
  WHERE link.from_document_id = saved_document_id
    AND link.owner_id = actor_id
    AND (
      (link.relation_type = 'prerequisite' AND NOT (link.to_document_id = ANY(prerequisite_ids)))
      OR
      (link.relation_type = 'related' AND NOT (link.to_document_id = ANY(related_ids)))
    );

  FOREACH relation_field IN ARRAY ARRAY['prerequisites', 'related']
  LOOP
    relation_type_value := CASE
      WHEN relation_field = 'prerequisites' THEN 'prerequisite'
      ELSE 'related'
    END;
    relation_ids := CASE
      WHEN relation_field = 'prerequisites' THEN prerequisite_ids
      ELSE related_ids
    END;
    FOREACH target_id IN ARRAY relation_ids
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.documents target
        WHERE target.id = target_id
          AND target.owner_id = actor_id
          AND target.knowledge_base_id = p_knowledge_base_id
          AND target.deleted_at IS NULL
      ) THEN
        INSERT INTO public.document_links (
          from_document_id, to_document_id, owner_id, relation_type
        ) VALUES (
          saved_document_id, target_id, actor_id, relation_type_value
        )
        ON CONFLICT (from_document_id, to_document_id, relation_type) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  DELETE FROM public.document_sources source
  WHERE source.document_id = saved_document_id
    AND source.owner_id = actor_id;

  FOR source_value, source_index IN
    SELECT item.value, item.ordinality::INTEGER
    FROM jsonb_array_elements(canonical_sources)
      WITH ORDINALITY AS item(value, ordinality)
  LOOP
    source_kind := source_value->>'kind';
    INSERT INTO public.document_sources (
      document_id,
      owner_id,
      kind,
      url,
      title,
      author,
      note,
      accessed_at,
      sort_order
    ) VALUES (
      saved_document_id,
      actor_id,
      source_kind,
      CASE WHEN source_kind = 'web' THEN source_value->>'url' ELSE NULL END,
      source_value->>'title',
      source_value->>'author',
      source_value->>'note',
      CASE WHEN source_kind = 'web' THEN CURRENT_DATE ELSE NULL END,
      source_index - 1
    );
  END LOOP;

  INSERT INTO public.document_versions (
    document_id,
    owner_id,
    version_no,
    snapshot,
    created_by
  ) VALUES (
    saved_document_id,
    actor_id,
    saved_revision,
    jsonb_build_object(
      'title', p_snapshot->>'title',
      'body', p_snapshot->>'body',
      'topic', p_snapshot->>'topic',
      'maturity', p_snapshot->>'maturity',
      'visibility', p_snapshot->>'visibility',
      'tags', to_jsonb(tag_names)::TEXT,
      'prerequisites', to_jsonb(prerequisite_ids)::TEXT,
      'related', to_jsonb(related_ids)::TEXT,
      '__sources', canonical_sources
    ),
    actor_id
  );

  response := jsonb_build_object(
    'result_version', 1,
    'status', 'saved',
    'operation_id', p_operation_id,
    'document_id', saved_document_id,
    'knowledge_base_id', p_knowledge_base_id,
    'revision', saved_revision,
    'created', is_created,
    'saved_at', receipt_saved_at
  );

  INSERT INTO wouldkeep_private.document_save_receipts (
    owner_id,
    operation_id,
    request_hash,
    result_version,
    document_id,
    knowledge_base_id,
    created,
    resulting_revision,
    response,
    saved_at
  ) VALUES (
    actor_id,
    p_operation_id,
    request_hash,
    1,
    saved_document_id,
    p_knowledge_base_id,
    is_created,
    saved_revision,
    response,
    receipt_saved_at
  );

  RETURN response;
END;
$$;

REVOKE ALL ON FUNCTION public.save_document_snapshot_v1(TEXT, UUID, UUID, BIGINT, JSONB)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_document_snapshot_v1(TEXT, UUID, UUID, BIGINT, JSONB)
  TO authenticated;

COMMENT ON SCHEMA wouldkeep_private IS
  'Browser-unexposed internal state. Keep absent from every PostgREST exposed-schema list.';
COMMENT ON TABLE wouldkeep_private.document_save_receipts IS
  'Append-only owner-scoped saved acknowledgements for save_document_snapshot_v1; conflicts/not-found results are read-only and no document body is stored.';
COMMENT ON FUNCTION public.save_document_snapshot_v1(TEXT, UUID, UUID, BIGINT, JSONB) IS
  'Atomically saves one owner document snapshot with CAS and owner-scoped idempotent acknowledgement. It does not publish or alter publication snapshots.';

RESET statement_timeout;
RESET lock_timeout;
