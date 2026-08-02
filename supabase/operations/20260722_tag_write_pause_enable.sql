-- Temporarily reject every write statement against tags and document_tags.
-- This is an explicitly operated maintenance gate, not a migration.

BEGIN;

SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '60s';

-- Fixed-order SHARE ROW EXCLUSIVE NOWAIT locks reject an already-active writer,
-- block every new RowExclusive writer until commit, and keep SELECT/pg_dump open.
LOCK TABLE public.tags IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.document_tags IN SHARE ROW EXCLUSIVE MODE NOWAIT;

DO $tag_write_pause_enable_preflight$
BEGIN
  IF to_regclass('public.tags') IS NULL
     OR to_regclass('public.document_tags') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_target_missing';
  END IF;

  IF (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.tags'::regclass)
       <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.document_tags'::regclass)
       <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.tags'::regclass)
       <> (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.document_tags'::regclass) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_owner_mismatch';
  END IF;

  -- PostgreSQL logical-replication apply workers do not fire statement-level
  -- triggers. This gate is valid only when neither target is an enabled
  -- subscription relation; every later state checkpoint repeats this proof.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_subscription_rel subscription_relation
    JOIN pg_catalog.pg_subscription subscription
      ON subscription.oid = subscription_relation.srsubid
    WHERE subscription.subenabled
      AND subscription_relation.srrelid IN (
        'public.tags'::regclass,
        'public.document_tags'::regclass
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_inbound_subscription_unsupported';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_namespace
       WHERE nspname = 'wouldkeep_maintenance'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc function
       JOIN pg_catalog.pg_namespace namespace
         ON namespace.oid = function.pronamespace
       WHERE namespace.nspname = 'wouldkeep_maintenance'
          OR function.proname = 'reject_tag_write_while_paused'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger trigger
       WHERE trigger.tgname IN (
         'wouldkeep_tags_write_pause',
         'wouldkeep_document_tags_write_pause'
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_objects_not_absent';
  END IF;
END;
$tag_write_pause_enable_preflight$;

CREATE SCHEMA wouldkeep_maintenance AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA wouldkeep_maintenance FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON SCHEMA wouldkeep_maintenance IS
  'wouldkeep temporary tag-write pause gate; remove only with the reviewed disable operation';

CREATE FUNCTION wouldkeep_maintenance.reject_tag_write_while_paused()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $tag_write_pause_function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'wouldkeep_tag_writes_paused';
END;
$tag_write_pause_function$;

REVOKE ALL ON FUNCTION wouldkeep_maintenance.reject_tag_write_while_paused()
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION wouldkeep_maintenance.reject_tag_write_while_paused() IS
  'rejects tag and document-tag writes while the reviewed maintenance pause is active';

CREATE TRIGGER wouldkeep_tags_write_pause
  BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.tags
  FOR EACH STATEMENT
  EXECUTE FUNCTION wouldkeep_maintenance.reject_tag_write_while_paused();
ALTER TABLE public.tags ENABLE ALWAYS TRIGGER wouldkeep_tags_write_pause;
COMMENT ON TRIGGER wouldkeep_tags_write_pause ON public.tags IS
  'wouldkeep temporary tag-write pause gate: exact SQLSTATE 55000';

CREATE TRIGGER wouldkeep_document_tags_write_pause
  BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.document_tags
  FOR EACH STATEMENT
  EXECUTE FUNCTION wouldkeep_maintenance.reject_tag_write_while_paused();
ALTER TABLE public.document_tags
  ENABLE ALWAYS TRIGGER wouldkeep_document_tags_write_pause;
COMMENT ON TRIGGER wouldkeep_document_tags_write_pause ON public.document_tags IS
  'wouldkeep temporary tag-write pause gate: exact SQLSTATE 55000';

DO $tag_write_pause_enable_postflight$
DECLARE
  gate_schema_oid oid;
  gate_function_oid oid;
  gate_owner_oid oid;
  tags_oid oid := 'public.tags'::regclass::oid;
  document_tags_oid oid := 'public.document_tags'::regclass::oid;
  tags_trigger_oid oid;
  document_tags_trigger_oid oid;
  expected_body text := $expected_body$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'wouldkeep_tag_writes_paused';
END;
$expected_body$;
BEGIN
  SELECT namespace.oid, namespace.nspowner
  INTO STRICT gate_schema_oid, gate_owner_oid
  FROM pg_catalog.pg_namespace namespace
  WHERE namespace.nspname = 'wouldkeep_maintenance';

  SELECT function.oid
  INTO STRICT gate_function_oid
  FROM pg_catalog.pg_proc function
  JOIN pg_catalog.pg_language language ON language.oid = function.prolang
  WHERE function.pronamespace = gate_schema_oid
    AND function.proname = 'reject_tag_write_while_paused'
    AND function.pronargs = 0
    AND function.proowner = gate_owner_oid
    AND function.prorettype = 'pg_catalog.trigger'::regtype
    AND language.lanname = 'plpgsql'
    AND function.prokind = 'f'
    AND function.provolatile = 'v'
    AND function.proparallel = 'u'
    AND NOT function.prosecdef
    AND NOT function.proleakproof
    AND NOT function.proisstrict
    AND function.proconfig = ARRAY['search_path=pg_catalog']
    AND function.prosrc = expected_body
    AND pg_catalog.obj_description(function.oid, 'pg_proc') =
      'rejects tag and document-tag writes while the reviewed maintenance pause is active';

  IF gate_owner_oid <> (SELECT relowner FROM pg_catalog.pg_class WHERE oid = tags_oid)
     OR gate_owner_oid <> (SELECT relowner FROM pg_catalog.pg_class WHERE oid = document_tags_oid)
     OR gate_owner_oid <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR pg_catalog.obj_description(gate_schema_oid, 'pg_namespace') <>
       'wouldkeep temporary tag-write pause gate; remove only with the reviewed disable operation'
     OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace = gate_schema_oid) <> 1
     OR (SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_type WHERE typnamespace = gate_schema_oid) <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_installation_failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_subscription_rel subscription_relation
    JOIN pg_catalog.pg_subscription subscription
      ON subscription.oid = subscription_relation.srsubid
    WHERE subscription.subenabled
      AND subscription_relation.srrelid IN (tags_oid, document_tags_oid)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_inbound_subscription_unsupported';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.aclexplode(
        COALESCE((SELECT nspacl FROM pg_catalog.pg_namespace WHERE oid = gate_schema_oid),
                 pg_catalog.acldefault('n', gate_owner_oid)))) <> 2
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE((SELECT nspacl FROM pg_catalog.pg_namespace WHERE oid = gate_schema_oid),
                  pg_catalog.acldefault('n', gate_owner_oid))) acl
       WHERE acl.grantee <> gate_owner_oid
          OR acl.grantor <> gate_owner_oid
          OR acl.privilege_type NOT IN ('USAGE', 'CREATE')
          OR acl.is_grantable
     )
     OR (SELECT count(*) FROM pg_catalog.aclexplode(
        COALESCE((SELECT proacl FROM pg_catalog.pg_proc WHERE oid = gate_function_oid),
                 pg_catalog.acldefault('f', gate_owner_oid)))) <> 1
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE((SELECT proacl FROM pg_catalog.pg_proc WHERE oid = gate_function_oid),
                  pg_catalog.acldefault('f', gate_owner_oid))) acl
       WHERE acl.grantee <> gate_owner_oid
          OR acl.grantor <> gate_owner_oid
          OR acl.privilege_type <> 'EXECUTE'
          OR acl.is_grantable
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_write_pause_installation_failed';
  END IF;

  SELECT trigger.oid
  INTO STRICT tags_trigger_oid
  FROM pg_catalog.pg_trigger trigger
  WHERE trigger.tgrelid = tags_oid
    AND trigger.tgname = 'wouldkeep_tags_write_pause'
    AND trigger.tgfoid = gate_function_oid
    AND trigger.tgtype = 62
    AND trigger.tgenabled = 'A'
    AND NOT trigger.tgisinternal
    AND NOT trigger.tgdeferrable
    AND NOT trigger.tginitdeferred
    AND trigger.tgconstraint = 0
    AND trigger.tgparentid = 0
    AND trigger.tgnargs = 0
    AND trigger.tgqual IS NULL
    AND pg_catalog.obj_description(trigger.oid, 'pg_trigger') =
      'wouldkeep temporary tag-write pause gate: exact SQLSTATE 55000';

  SELECT trigger.oid
  INTO STRICT document_tags_trigger_oid
  FROM pg_catalog.pg_trigger trigger
  WHERE trigger.tgrelid = document_tags_oid
    AND trigger.tgname = 'wouldkeep_document_tags_write_pause'
    AND trigger.tgfoid = gate_function_oid
    AND trigger.tgtype = 62
    AND trigger.tgenabled = 'A'
    AND NOT trigger.tgisinternal
    AND NOT trigger.tgdeferrable
    AND NOT trigger.tginitdeferred
    AND trigger.tgconstraint = 0
    AND trigger.tgparentid = 0
    AND trigger.tgnargs = 0
    AND trigger.tgqual IS NULL
    AND pg_catalog.obj_description(trigger.oid, 'pg_trigger') =
      'wouldkeep temporary tag-write pause gate: exact SQLSTATE 55000';

  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgfoid = gate_function_oid) <> 2
     OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname IN (
       'wouldkeep_tags_write_pause', 'wouldkeep_document_tags_write_pause')) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_installation_failed';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_depend dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::regclass
        AND dependency.objid = gate_function_oid
        AND dependency.objsubid = 0) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_depend dependency
       WHERE dependency.classid = 'pg_catalog.pg_proc'::regclass
         AND dependency.objid = gate_function_oid
         AND dependency.refclassid = 'pg_catalog.pg_namespace'::regclass
         AND dependency.refobjid = gate_schema_oid
         AND dependency.refobjsubid = 0
         AND dependency.deptype = 'n'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_depend dependency
       JOIN pg_catalog.pg_language language ON language.oid = dependency.refobjid
       WHERE dependency.classid = 'pg_catalog.pg_proc'::regclass
         AND dependency.objid = gate_function_oid
         AND dependency.refclassid = 'pg_catalog.pg_language'::regclass
         AND language.lanname = 'plpgsql'
         AND dependency.deptype = 'n'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_installation_failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      (tags_trigger_oid, tags_oid),
      (document_tags_trigger_oid, document_tags_oid)
    ) expected(trigger_oid, relation_oid)
    WHERE (SELECT count(*) FROM pg_catalog.pg_depend dependency
           WHERE dependency.classid = 'pg_catalog.pg_trigger'::regclass
             AND dependency.objid = expected.trigger_oid
             AND dependency.objsubid = 0) <> 2
       OR NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_depend dependency
         WHERE dependency.classid = 'pg_catalog.pg_trigger'::regclass
           AND dependency.objid = expected.trigger_oid
           AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
           AND dependency.refobjid = expected.relation_oid
           AND dependency.refobjsubid = 0
           AND dependency.deptype = 'a'
       )
       OR NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_depend dependency
         WHERE dependency.classid = 'pg_catalog.pg_trigger'::regclass
           AND dependency.objid = expected.trigger_oid
           AND dependency.refclassid = 'pg_catalog.pg_proc'::regclass
           AND dependency.refobjid = gate_function_oid
           AND dependency.refobjsubid = 0
           AND dependency.deptype = 'n'
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_installation_failed';
  END IF;
EXCEPTION
  WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_installation_failed';
END;
$tag_write_pause_enable_postflight$;

COMMIT;

SELECT 'tag_write_pause_enabled' AS result;
