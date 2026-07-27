-- Production-safe, read-only preflight for 20260722000200.
-- Run only after 20260722000100 is deployed and the Supabase migration ledger is zero.

DO $$
DECLARE
  expected_ledger CONSTANT TEXT[] := ARRAY[
    '20260712', '20260714', '20260715', '20260716', '20260717',
    '20260718000100', '20260718000200', '20260718000300',
    '20260718000400', '20260718000500', '20260718000600',
    '20260718000700', '20260718000800', '20260718000900',
    '20260718001000', '20260718001100', '20260718001200',
    '20260721000100', '20260722000100'
  ]::TEXT[];
  actual_ledger TEXT[];
  source_record RECORD;
  query_part TEXT;
  fragment_part TEXT;
  raw_parameter TEXT;
  raw_key TEXT;
  decoded_key TEXT;
  decoded_bytes BYTEA;
  cursor_position INTEGER;
  current_character TEXT;
  hex_pair TEXT;
BEGIN
  IF to_regprocedure('public.grant_role(uuid,text,text)') IS NULL
    OR pg_get_functiondef('public.grant_role(uuid,text,text)'::REGPROCEDURE)
      NOT LIKE '%public.is_site_owner(target_uid)%'
  THEN
    RAISE EXCEPTION
      '20260722000100 site-owner invariant is not deployed; do not deploy 20260722000200 out of order';
  END IF;

  IF to_regnamespace('wouldkeep_private') IS NOT NULL
    OR to_regprocedure(
      'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint catalog_constraint
      WHERE (
          catalog_constraint.conname = 'knowledge_bases_id_owner_unique'
          AND catalog_constraint.conrelid = 'public.knowledge_bases'::REGCLASS
        )
        OR (
          catalog_constraint.conname = 'tags_knowledge_base_owner_fkey'
          AND catalog_constraint.conrelid = 'public.tags'::REGCLASS
        )
    )
  THEN
    RAISE EXCEPTION
      'atomic save schema/function/constraint already exists; inspect migration history instead of reapplying';
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
      'wouldkeep_private is configured as a PostgREST exposed schema; remove it before deployment';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documents document
    JOIN public.knowledge_bases knowledge_base
      ON knowledge_base.id = document.knowledge_base_id
    WHERE document.owner_id <> knowledge_base.owner_id
      OR char_length(document.topic) > 160
      OR char_length(document.body) > 1000000
      OR octet_length(convert_to(document.body, 'UTF8')) > 4000000
      OR document.revision > 9007199254740990
  ) THEN
    RAISE EXCEPTION
      'document owner, size, or JS-safe revision preflight failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.document_versions version
    JOIN public.documents document ON document.id = version.document_id
    WHERE version.owner_id <> document.owner_id
      OR version.created_by <> document.owner_id
      OR version.version_no > document.revision
  ) THEN
    RAISE EXCEPTION
      'document version owner/history preflight failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    WHERE tag.name <> regexp_replace(
        btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
      )
      OR tag.normalized_name <> lower(regexp_replace(
        btrim(normalize(tag.name, NFKC)), '[[:space:]]+', ' ', 'g'
      ))
      OR tag.name ~ '^[[:punct:][:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'tag NFKC/whitespace/lowercase preflight failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    LEFT JOIN public.knowledge_bases knowledge_base
      ON knowledge_base.id = tag.knowledge_base_id
     AND knowledge_base.owner_id = tag.owner_id
    WHERE knowledge_base.id IS NULL
  ) THEN
    RAISE EXCEPTION 'tag owner/knowledge-base owner invariant preflight failed';
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
    RAISE EXCEPTION 'organization owner/knowledge-base preflight failed';
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
    RAISE EXCEPTION 'organization array-size preflight failed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger trigger
    JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'document_links'
      AND trigger.tgname = 'document_links_require_valid_endpoints'
      AND trigger.tgenabled = 'O'
      AND NOT trigger.tgisinternal
      AND pg_catalog.pg_get_triggerdef(trigger.oid) LIKE
        '%BEFORE INSERT OR UPDATE ON public.document_links%'
  ) <> 1 THEN
    RAISE EXCEPTION '20260721000100 document-link trigger preflight failed';
  END IF;

  IF EXISTS (
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
    RAISE EXCEPTION 'source URL duplicate preflight failed';
  END IF;

  FOR source_record IN
    SELECT * FROM public.document_sources ORDER BY document_id, sort_order
  LOOP
    IF source_record.title <> btrim(source_record.title)
      OR source_record.author <> btrim(source_record.author)
      OR source_record.note <> btrim(source_record.note)
      OR (
        source_record.kind = 'personal'
        AND (source_record.url IS NOT NULL OR btrim(source_record.title) = '')
      )
      OR (
        source_record.kind = 'web'
        AND (
          source_record.url IS NULL
          OR source_record.url <> btrim(source_record.url)
          OR source_record.url !~* '^https?://[^[:space:]]+$'
          OR source_record.url ~* '^https?://[^/@[:space:]]+@'
        )
      )
    THEN
      RAISE EXCEPTION
        'source canonical-shape preflight failed for document %',
        source_record.document_id;
    END IF;

    IF source_record.kind = 'web' THEN
      query_part := '';
      fragment_part := '';
      IF strpos(source_record.url, '?') > 0 THEN
        query_part := split_part(split_part(source_record.url, '?', 2), '#', 1);
      END IF;
      IF strpos(source_record.url, '#') > 0 THEN
        fragment_part := split_part(source_record.url, '#', 2);
        IF strpos(fragment_part, '?') > 0 THEN
          fragment_part := split_part(fragment_part, '?', 2);
        END IF;
      END IF;

      FOREACH raw_parameter IN ARRAY string_to_array(query_part || '&' || fragment_part, '&')
      LOOP
        raw_key := split_part(raw_parameter, '=', 1);
        decoded_bytes := ''::BYTEA;
        cursor_position := 1;
        WHILE cursor_position <= char_length(raw_key)
        LOOP
          current_character := substring(raw_key FROM cursor_position FOR 1);
          hex_pair := substring(raw_key FROM cursor_position + 1 FOR 2);
          IF current_character = '%' AND hex_pair ~ '^[0-9A-Fa-f]{2}$' THEN
            decoded_bytes := decoded_bytes || decode(hex_pair, 'hex');
            cursor_position := cursor_position + 3;
          ELSE
            decoded_bytes := decoded_bytes || convert_to(
              CASE WHEN current_character = '+' THEN ' ' ELSE current_character END,
              'UTF8'
            );
            cursor_position := cursor_position + 1;
          END IF;
        END LOOP;

        BEGIN
          decoded_key := lower(convert_from(decoded_bytes, 'UTF8'));
        EXCEPTION WHEN character_not_in_repertoire THEN
          decoded_key := lower(raw_key);
        END;

        IF decoded_key ~ '^(token|access[_-]?token|auth|authorization|password|passcode|session|api[_-]?key|key|signature|sig|x-amz-signature)$'
        THEN
          RAISE EXCEPTION
            'source sensitive URL key preflight failed for document %',
            source_record.document_id;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  SELECT array_agg(version ORDER BY version)
  INTO actual_ledger
  FROM supabase_migrations.schema_migrations;

  IF actual_ledger IS DISTINCT FROM expected_ledger
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 19
    OR (
      SELECT count(DISTINCT version)
      FROM supabase_migrations.schema_migrations
    ) <> 19
    OR (
      SELECT count(*)
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000100'
        AND name = 'site_owner_role_invariant'
    ) <> 1
    OR EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000200'
    )
  THEN
    RAISE EXCEPTION 'pre-deployment migration ledger mismatch';
  END IF;

  RAISE NOTICE
    'atomic_save_preflight_passed documents=% versions=% tags=% links=% sources=%',
    (SELECT count(*) FROM public.documents),
    (SELECT count(*) FROM public.document_versions),
    (SELECT count(*) FROM public.tags),
    (SELECT count(*) FROM public.document_links),
    (SELECT count(*) FROM public.document_sources);
END;
$$;
