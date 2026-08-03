-- Remove the temporary tag-write pause only when its complete catalog contract
-- is still exact. Any drift raises before DROP and leaves the pause active.

BEGIN;

SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.tags IN SHARE ROW EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.document_tags IN SHARE ROW EXCLUSIVE MODE NOWAIT;

DO $tag_write_pause_disable_preflight$
DECLARE
  gate_schema_oid oid;
  gate_function_oid oid;
  permit_function_oid oid;
  gate_owner_oid oid;
  tags_oid oid := 'public.tags'::regclass::oid;
  document_tags_oid oid := 'public.document_tags'::regclass::oid;
  tags_trigger_oid oid;
  document_tags_trigger_oid oid;
  expected_body text := $expected_body$
DECLARE
  permit_oid oid;
  permit_allowed boolean := false;
  tags_owner_oid oid;
  document_tags_owner_oid oid;
  invoker_oid oid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND TG_LEVEL = 'STATEMENT'
     AND TG_WHEN = 'BEFORE'
     AND TG_RELID = 'public.tags'::regclass THEN
    permit_oid := to_regclass('pg_temp.wouldkeep_tag_normalization_00150_permit');

    IF permit_oid IS NOT NULL THEN
      SELECT relation.relowner
      INTO STRICT tags_owner_oid
      FROM pg_catalog.pg_class relation
      WHERE relation.oid = 'public.tags'::regclass;

      SELECT relation.relowner
      INTO STRICT document_tags_owner_oid
      FROM pg_catalog.pg_class relation
      WHERE relation.oid = 'public.document_tags'::regclass;

      SELECT role.oid
      INTO STRICT invoker_oid
      FROM pg_catalog.pg_roles role
      WHERE role.rolname = current_user;

      IF tags_owner_oid = document_tags_owner_oid
         AND invoker_oid = tags_owner_oid
         AND EXISTS (
           SELECT 1
           FROM pg_catalog.pg_class permit_relation
           WHERE permit_relation.oid = permit_oid
             AND permit_relation.relowner = tags_owner_oid
             AND permit_relation.relnamespace = pg_my_temp_schema()
             AND permit_relation.relkind = 'r'
             AND permit_relation.relpersistence = 't'
             AND NOT permit_relation.relrowsecurity
             AND NOT permit_relation.relforcerowsecurity
         )
         AND (SELECT count(*)
              FROM pg_catalog.pg_attribute attribute
              WHERE attribute.attrelid = permit_oid
                AND attribute.attnum > 0
                AND NOT attribute.attisdropped) = 5
         AND NOT EXISTS (
           SELECT 1
           FROM (VALUES
             (1, 'migration_version'::name, 'pg_catalog.int8'::regtype::oid),
             (2, 'backend_pid'::name, 'pg_catalog.int4'::regtype::oid),
             (3, 'transaction_id'::name, 'pg_catalog.xid8'::regtype::oid),
             (4, 'invoker_oid'::name, 'pg_catalog.oid'::regtype::oid),
             (5, 'session_user_oid'::name, 'pg_catalog.oid'::regtype::oid)
           ) expected(attnum, attname, atttypid)
           LEFT JOIN pg_catalog.pg_attribute attribute
             ON attribute.attrelid = permit_oid
            AND attribute.attnum = expected.attnum
            AND NOT attribute.attisdropped
           WHERE attribute.attname IS DISTINCT FROM expected.attname
              OR attribute.atttypid IS DISTINCT FROM expected.atttypid
              OR NOT attribute.attnotnull
              OR attribute.attgenerated <> ''
              OR attribute.attidentity <> ''
         )
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_constraint permit_constraint
           WHERE permit_constraint.conrelid = permit_oid
         )
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_index permit_index
           WHERE permit_index.indrelid = permit_oid
         )
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_trigger permit_trigger
           WHERE permit_trigger.tgrelid = permit_oid
             AND NOT permit_trigger.tgisinternal
         ) THEN
        EXECUTE pg_catalog.format(
          'SELECT count(*) = 1 AND bool_and(migration_version = 20260722000150 AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id_if_assigned() AND invoker_oid = $1 AND session_user_oid = $2) FROM %s',
          permit_oid::regclass
        )
        INTO permit_allowed
        USING
          invoker_oid,
          (SELECT role.oid FROM pg_catalog.pg_roles role WHERE role.rolname = session_user);
      END IF;
    END IF;
  END IF;

  IF permit_allowed THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'wouldkeep_tag_writes_paused';
END;
$expected_body$;
  expected_permit_body text := $expected_permit_body$
DECLARE
  tags_owner_oid oid;
  document_tags_owner_oid oid;
  invoker_oid oid;
BEGIN
  SELECT relation.relowner
  INTO STRICT tags_owner_oid
  FROM pg_catalog.pg_class relation
  WHERE relation.oid = 'public.tags'::regclass;

  SELECT relation.relowner
  INTO STRICT document_tags_owner_oid
  FROM pg_catalog.pg_class relation
  WHERE relation.oid = 'public.document_tags'::regclass;

  SELECT role.oid
  INTO STRICT invoker_oid
  FROM pg_catalog.pg_roles role
  WHERE role.rolname = current_user;

  IF tags_owner_oid <> document_tags_owner_oid
     OR invoker_oid <> tags_owner_oid THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_normalization_permit_owner_mismatch';
  END IF;

  IF to_regclass('pg_temp.wouldkeep_tag_normalization_00150_permit') IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_normalization_permit_not_absent';
  END IF;

  IF (SELECT count(*)
      FROM pg_catalog.pg_locks relation_lock
      WHERE relation_lock.locktype = 'relation'
        AND relation_lock.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
        AND relation_lock.pid = pg_backend_pid()
        AND relation_lock.granted
        AND relation_lock.mode = 'ShareRowExclusiveLock'
        AND relation_lock.relation IN (
          'public.tags'::regclass,
          'public.document_tags'::regclass
        )) <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'wouldkeep_tag_normalization_permit_lock_mismatch';
  END IF;

  CREATE TEMP TABLE pg_temp.wouldkeep_tag_normalization_00150_permit (
    migration_version bigint NOT NULL,
    backend_pid integer NOT NULL,
    transaction_id xid8 NOT NULL,
    invoker_oid oid NOT NULL,
    session_user_oid oid NOT NULL
  ) ON COMMIT DROP;

  REVOKE ALL ON TABLE pg_temp.wouldkeep_tag_normalization_00150_permit
    FROM PUBLIC, anon, authenticated, service_role;

  INSERT INTO pg_temp.wouldkeep_tag_normalization_00150_permit (
    migration_version,
    backend_pid,
    transaction_id,
    invoker_oid,
    session_user_oid
  )
  VALUES (
    20260722000150,
    pg_backend_pid(),
    pg_current_xact_id(),
    invoker_oid,
    (SELECT role.oid FROM pg_catalog.pg_roles role WHERE role.rolname = session_user)
  );
END;
$expected_permit_body$;
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

  SELECT function.oid
  INTO STRICT permit_function_oid
  FROM pg_catalog.pg_proc function
  JOIN pg_catalog.pg_language language ON language.oid = function.prolang
  WHERE function.pronamespace = gate_schema_oid
    AND function.proname = 'open_tag_normalization_00150_permit'
    AND function.pronargs = 0
    AND function.proowner = gate_owner_oid
    AND function.prorettype = 'pg_catalog.void'::regtype
    AND language.lanname = 'plpgsql'
    AND function.prokind = 'f'
    AND function.provolatile = 'v'
    AND function.proparallel = 'u'
    AND NOT function.prosecdef
    AND NOT function.proleakproof
    AND NOT function.proisstrict
    AND function.proconfig = ARRAY['search_path=pg_catalog']
    AND function.prosrc = expected_permit_body
    AND pg_catalog.obj_description(function.oid, 'pg_proc') =
      'opens one transaction-local owner permit for migration 20260722000150 after both tag relations are locked';

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
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_trigger_drift';
  END IF;

  IF pg_catalog.obj_description(gate_schema_oid, 'pg_namespace') <>
       'wouldkeep temporary tag-write pause gate; remove only with the reviewed disable operation'
     OR gate_owner_oid <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR gate_owner_oid <> (SELECT relowner FROM pg_catalog.pg_class WHERE oid = tags_oid)
     OR gate_owner_oid <> (SELECT relowner FROM pg_catalog.pg_class WHERE oid = document_tags_oid)
     OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace = gate_schema_oid) <> 2
     OR (SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_type WHERE typnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_collation WHERE collnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_conversion WHERE connamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_operator WHERE oprnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_opclass WHERE opcnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_opfamily WHERE opfnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_ts_config WHERE cfgnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_ts_dict WHERE dictnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_ts_parser WHERE prsnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_ts_template WHERE tmplnamespace = gate_schema_oid) <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_schema_drift';
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
     )
     OR (SELECT count(*) FROM pg_catalog.aclexplode(
        COALESCE((SELECT proacl FROM pg_catalog.pg_proc WHERE oid = permit_function_oid),
                 pg_catalog.acldefault('f', gate_owner_oid)))) <> 1
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE((SELECT proacl FROM pg_catalog.pg_proc WHERE oid = permit_function_oid),
                  pg_catalog.acldefault('f', gate_owner_oid))) acl
       WHERE acl.grantee <> gate_owner_oid
          OR acl.grantor <> gate_owner_oid
          OR acl.privilege_type <> 'EXECUTE'
          OR acl.is_grantable
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_acl_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES (gate_function_oid), (permit_function_oid)) expected(function_oid)
    WHERE (SELECT count(*) FROM pg_catalog.pg_depend dependency
           WHERE dependency.classid = 'pg_catalog.pg_proc'::regclass
             AND dependency.objid = expected.function_oid
             AND dependency.objsubid = 0) <> 2
       OR NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_depend dependency
         WHERE dependency.classid = 'pg_catalog.pg_proc'::regclass
           AND dependency.objid = expected.function_oid
           AND dependency.refclassid = 'pg_catalog.pg_namespace'::regclass
           AND dependency.refobjid = gate_schema_oid
           AND dependency.refobjsubid = 0
           AND dependency.deptype = 'n'
       )
       OR NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_depend dependency
         JOIN pg_catalog.pg_language language ON language.oid = dependency.refobjid
         WHERE dependency.classid = 'pg_catalog.pg_proc'::regclass
           AND dependency.objid = expected.function_oid
           AND dependency.refclassid = 'pg_catalog.pg_language'::regclass
           AND language.lanname = 'plpgsql'
           AND dependency.deptype = 'n'
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_function_dependency_drift';
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
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_trigger_dependency_drift';
  END IF;
EXCEPTION
  WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_object_drift';
END;
$tag_write_pause_disable_preflight$;

DROP TRIGGER wouldkeep_tags_write_pause ON public.tags;
DROP TRIGGER wouldkeep_document_tags_write_pause ON public.document_tags;
DROP FUNCTION wouldkeep_maintenance.reject_tag_write_while_paused();
DROP FUNCTION wouldkeep_maintenance.open_tag_normalization_00150_permit();
DROP SCHEMA wouldkeep_maintenance;

COMMIT;

SELECT 'tag_write_pause_disabled' AS result;
