-- Production-safe, read-only postflight contract for 20260722000200.

DO $atomic_save_contract$
DECLARE
  save_rpc CONSTANT REGPROCEDURE :=
    'public.save_document_snapshot_v1(text,uuid,uuid,bigint,jsonb)'::REGPROCEDURE;
  decode_helper CONSTANT REGPROCEDURE :=
    'wouldkeep_private.percent_decode_url_component(text)'::REGPROCEDURE;
  secret_helper CONSTANT REGPROCEDURE :=
    'wouldkeep_private.source_url_has_secret(text)'::REGPROCEDURE;
  receipt_guard CONSTANT REGPROCEDURE :=
    'wouldkeep_private.require_valid_document_save_receipt()'::REGPROCEDURE;
  receipt_relation CONSTANT REGCLASS :=
    'wouldkeep_private.document_save_receipts'::REGCLASS;
  expected_ledger CONSTANT TEXT[] := ARRAY[
    '20260712', '20260714', '20260715', '20260716', '20260717',
    '20260718000100', '20260718000200', '20260718000300',
    '20260718000400', '20260718000500', '20260718000600',
    '20260718000700', '20260718000800', '20260718000900',
    '20260718001000', '20260718001100', '20260718001200',
    '20260721000100', '20260722000100', '20260722000150',
    '20260722000200'
  ]::TEXT[];
  expected_columns CONSTANT TEXT[] := ARRAY[
    'created', 'document_id', 'knowledge_base_id', 'operation_id', 'owner_id',
    'request_hash', 'response', 'result_version', 'resulting_revision', 'saved_at'
  ]::TEXT[];
  actual_acl TEXT[];
  actual_ledger TEXT[];
  application_role TEXT;
  required_table TEXT;
  required_privileges TEXT;
BEGIN
  IF to_regprocedure('public.grant_role(uuid,text,text)') IS NULL
    OR pg_get_functiondef('public.grant_role(uuid,text,text)'::REGPROCEDURE)
      NOT LIKE '%public.is_site_owner(target_uid)%'
  THEN
    RAISE EXCEPTION
      '20260722000100 site-owner invariant is not present; do not accept 20260722000200';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE (namespace.nspname, procedure.proname) IN (
      ('public', 'save_document_snapshot_v1'),
      ('wouldkeep_private', 'percent_decode_url_component'),
      ('wouldkeep_private', 'source_url_has_secret'),
      ('wouldkeep_private', 'require_valid_document_save_receipt')
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'atomic-save function overload set changed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'wouldkeep_private'
  ) <> 3 THEN
    RAISE EXCEPTION 'private atomic-save helper set changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
    JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
    WHERE procedure.oid = save_rpc
      AND procedure.prosecdef
      AND NOT procedure.proisstrict
      AND procedure.prorettype = 'jsonb'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.prokind = 'f'
      AND procedure.proparallel = 'u'
      AND NOT procedure.proleakproof
      AND procedure.proargnames = ARRAY[
        'p_operation_id', 'p_document_id', 'p_knowledge_base_id',
        'p_expected_revision', 'p_snapshot'
      ]::TEXT[]
      AND procedure.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
      AND language.lanname = 'plpgsql'
      AND owner.rolname = 'postgres'
      AND md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) =
        '9eeb474d4151b9639ed2db44d0e6a04c'
  ) THEN
    RAISE EXCEPTION 'atomic save RPC owner/security/ABI/body fingerprint changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
    JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
    WHERE procedure.oid = decode_helper
      AND NOT procedure.prosecdef
      AND procedure.proisstrict
      AND procedure.prorettype = 'text'::REGTYPE
      AND procedure.provolatile = 'i'
      AND procedure.prokind = 'f'
      AND procedure.proparallel = 'u'
      AND NOT procedure.proleakproof
      AND procedure.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
      AND language.lanname = 'plpgsql'
      AND owner.rolname = 'postgres'
      AND md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) =
        'e5c327994552b280617a8820e4107d46'
  ) THEN
    RAISE EXCEPTION 'percent-decoder owner/security/ABI/body fingerprint changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
    JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
    WHERE procedure.oid = secret_helper
      AND NOT procedure.prosecdef
      AND procedure.proisstrict
      AND procedure.prorettype = 'boolean'::REGTYPE
      AND procedure.provolatile = 'i'
      AND procedure.prokind = 'f'
      AND procedure.proparallel = 'u'
      AND NOT procedure.proleakproof
      AND procedure.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
      AND language.lanname = 'plpgsql'
      AND owner.rolname = 'postgres'
      AND md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) =
        'c4881a93b30fe7445f1fadadf17308e6'
  ) THEN
    RAISE EXCEPTION 'secret-detector owner/security/ABI/body fingerprint changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
    JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
    WHERE procedure.oid = receipt_guard
      AND procedure.prosecdef
      AND NOT procedure.proisstrict
      AND procedure.prorettype = 'trigger'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.prokind = 'f'
      AND procedure.proparallel = 'u'
      AND NOT procedure.proleakproof
      AND procedure.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
      AND language.lanname = 'plpgsql'
      AND owner.rolname = 'postgres'
      AND md5(regexp_replace(procedure.prosrc, '[[:space:]]+', ' ', 'g')) =
        '9a6b5a61d9d8e615cee64f05574f5d4d'
  ) THEN
    RAISE EXCEPTION 'receipt guard owner/security/ABI/body fingerprint changed';
  END IF;

  SELECT array_agg(entry ORDER BY entry)
  INTO actual_acl
  FROM (
    SELECT concat(
      CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
      '|', acl.privilege_type, '|', acl.is_grantable::TEXT, '|',
      pg_get_userbyid(acl.grantor)
    ) AS entry
    FROM pg_catalog.pg_proc procedure,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) acl
    WHERE procedure.oid = save_rpc
  ) exploded;

  IF actual_acl IS DISTINCT FROM ARRAY[
    'authenticated|EXECUTE|false|postgres',
    'postgres|EXECUTE|false|postgres'
  ]::TEXT[]
    OR NOT has_function_privilege('authenticated', save_rpc, 'EXECUTE')
    OR has_function_privilege('anon', save_rpc, 'EXECUTE')
    OR has_function_privilege('service_role', save_rpc, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'atomic save RPC ACL is not exactly authenticated plus owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) acl
    WHERE namespace.nspname = 'wouldkeep_private'
      AND (
        acl.grantee <> procedure.proowner
        OR acl.grantor <> procedure.proowner
        OR acl.privilege_type <> 'EXECUTE'
        OR acl.is_grantable
      )
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) acl
    WHERE namespace.nspname = 'wouldkeep_private'
      AND procedure.oid IN (decode_helper, secret_helper, receipt_guard)
  ) <> 3 THEN
    RAISE EXCEPTION 'private helper ACL contains an unexpected grantee or grant option';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace namespace
    JOIN pg_catalog.pg_roles owner ON owner.oid = namespace.nspowner
    WHERE namespace.nspname = 'wouldkeep_private'
      AND owner.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION 'private schema owner changed';
  END IF;

  SELECT array_agg(entry ORDER BY entry)
  INTO actual_acl
  FROM (
    SELECT concat(
      CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
      '|', acl.privilege_type, '|', acl.is_grantable::TEXT, '|',
      pg_get_userbyid(acl.grantor)
    ) AS entry
    FROM pg_catalog.pg_namespace namespace,
         LATERAL pg_catalog.aclexplode(
           COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
         ) acl
    WHERE namespace.nspname = 'wouldkeep_private'
  ) exploded;

  IF actual_acl IS DISTINCT FROM ARRAY[
    'postgres|CREATE|false|postgres',
    'postgres|USAGE|false|postgres'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'private schema ACL is not owner-only';
  END IF;

  SELECT array_agg(entry ORDER BY entry)
  INTO actual_acl
  FROM (
    SELECT concat(
      CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
      '|', acl.privilege_type, '|', acl.is_grantable::TEXT, '|',
      pg_get_userbyid(acl.grantor)
    ) AS entry
    FROM pg_catalog.pg_class relation,
         LATERAL pg_catalog.aclexplode(
           COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
         ) acl
    WHERE relation.oid = receipt_relation
  ) exploded;

  IF actual_acl IS DISTINCT FROM ARRAY[
    'postgres|DELETE|false|postgres',
    'postgres|INSERT|false|postgres',
    'postgres|MAINTAIN|false|postgres',
    'postgres|REFERENCES|false|postgres',
    'postgres|SELECT|false|postgres',
    'postgres|TRIGGER|false|postgres',
    'postgres|TRUNCATE|false|postgres',
    'postgres|UPDATE|false|postgres'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'private receipt table ACL is not owner-only';
  END IF;

  FOREACH application_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF has_schema_privilege(application_role, 'wouldkeep_private', 'USAGE')
      OR has_schema_privilege(application_role, 'wouldkeep_private', 'CREATE')
      OR has_table_privilege(application_role, receipt_relation, 'SELECT')
      OR has_table_privilege(application_role, receipt_relation, 'INSERT')
      OR has_table_privilege(application_role, receipt_relation, 'UPDATE')
      OR has_table_privilege(application_role, receipt_relation, 'DELETE')
      OR has_function_privilege(application_role, decode_helper, 'EXECUTE')
      OR has_function_privilege(application_role, secret_helper, 'EXECUTE')
      OR has_function_privilege(application_role, receipt_guard, 'EXECUTE')
    THEN
      RAISE EXCEPTION '% has effective access to a private atomic-save object', application_role;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_roles owner ON owner.oid = relation.relowner
    WHERE relation.oid = receipt_relation
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
      AND NOT relation.relforcerowsecurity
      AND owner.rolname = 'postgres'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'wouldkeep_private'
      AND policy.tablename = 'document_save_receipts'
  ) THEN
    RAISE EXCEPTION 'receipt owner/RLS/policy contract changed';
  END IF;

  IF (
    SELECT array_agg(concat(
      attribute.attnum, '|', attribute.attname, '|',
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), '|',
      attribute.attnotnull::TEXT, '|',
      COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '')
    ) ORDER BY attribute.attnum)
    FROM pg_catalog.pg_attribute attribute
    LEFT JOIN pg_catalog.pg_attrdef default_value
      ON default_value.adrelid = attribute.attrelid
     AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = receipt_relation
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) IS DISTINCT FROM ARRAY[
    '1|owner_id|uuid|true|',
    '2|operation_id|text|true|',
    '3|request_hash|text|true|',
    '4|result_version|smallint|true|1',
    '5|document_id|uuid|true|',
    '6|knowledge_base_id|uuid|true|',
    '7|created|boolean|true|',
    '8|resulting_revision|bigint|true|',
    '9|response|jsonb|true|',
    '10|saved_at|timestamp with time zone|true|clock_timestamp()'
  ]::TEXT[]
    OR (
      SELECT array_agg(catalog_column.column_name::TEXT ORDER BY catalog_column.column_name)
      FROM information_schema.columns catalog_column
      WHERE catalog_column.table_schema = 'wouldkeep_private'
        AND catalog_column.table_name = 'document_save_receipts'
    ) IS DISTINCT FROM expected_columns
  THEN
    RAISE EXCEPTION 'receipt ordered column/type/null/default ABI changed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint catalog_constraint
    WHERE catalog_constraint.conrelid = receipt_relation
  ) <> 10 OR (
    SELECT md5(string_agg(
      catalog_constraint.conname || '|' || catalog_constraint.contype::TEXT || '|' ||
      catalog_constraint.convalidated::TEXT || '|' ||
      catalog_constraint.condeferrable::TEXT || '|' ||
      catalog_constraint.condeferred::TEXT || '|' ||
      pg_catalog.pg_get_constraintdef(catalog_constraint.oid),
      E'\n' ORDER BY catalog_constraint.conname
    ))
    FROM pg_catalog.pg_constraint catalog_constraint
    WHERE catalog_constraint.conrelid = receipt_relation
  ) <> 'a1606e84292826e2735ed41a52354a66' THEN
    RAISE EXCEPTION 'receipt PK/CHECK/FK constraint fingerprint changed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger trigger
    WHERE trigger.tgrelid = receipt_relation
      AND NOT trigger.tgisinternal
  ) <> 1 OR (
    SELECT count(*)
    FROM pg_catalog.pg_trigger trigger
    WHERE trigger.tgrelid = receipt_relation
      AND trigger.tgname = 'document_save_receipts_require_valid_owner_document'
      AND trigger.tgfoid = receipt_guard
      AND trigger.tgenabled = 'O'
      AND NOT trigger.tgisinternal
      AND trigger.tgtype = 7
      AND trigger.tgnargs = 0
      AND cardinality(trigger.tgattr::SMALLINT[]) = 0
      AND md5(regexp_replace(
        pg_catalog.pg_get_triggerdef(trigger.oid), '[[:space:]]+', ' ', 'g'
      )) = '6dfbe536863354651eb24e0d6cff6a28'
  ) <> 1 THEN
    RAISE EXCEPTION 'receipt trigger definition/function fingerprint changed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint catalog_constraint
    JOIN pg_catalog.pg_index catalog_index
      ON catalog_index.indexrelid = catalog_constraint.conindid
    WHERE catalog_constraint.conrelid = 'public.knowledge_bases'::REGCLASS
      AND catalog_constraint.conname = 'knowledge_bases_id_owner_unique'
      AND catalog_constraint.contype = 'u'
      AND catalog_constraint.convalidated
      AND NOT catalog_constraint.condeferrable
      AND NOT catalog_constraint.condeferred
      AND catalog_constraint.conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = 'public.knowledge_bases'::REGCLASS AND attname = 'id'),
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = 'public.knowledge_bases'::REGCLASS AND attname = 'owner_id')
      ]::SMALLINT[]
      AND catalog_index.indisunique
      AND catalog_index.indisvalid
      AND catalog_index.indisready
      AND catalog_index.indimmediate
  ) <> 1 THEN
    RAISE EXCEPTION 'knowledge-base composite owner key contract changed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint catalog_constraint
    WHERE catalog_constraint.conrelid = 'public.tags'::REGCLASS
      AND catalog_constraint.conname = 'tags_knowledge_base_owner_fkey'
      AND catalog_constraint.contype = 'f'
      AND catalog_constraint.confrelid = 'public.knowledge_bases'::REGCLASS
      AND catalog_constraint.convalidated
      AND NOT catalog_constraint.condeferrable
      AND NOT catalog_constraint.condeferred
      AND catalog_constraint.confmatchtype = 's'
      AND catalog_constraint.confupdtype = 'r'
      AND catalog_constraint.confdeltype = 'c'
      AND catalog_constraint.conkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = 'public.tags'::REGCLASS AND attname = 'knowledge_base_id'),
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = 'public.tags'::REGCLASS AND attname = 'owner_id')
      ]::SMALLINT[]
      AND catalog_constraint.confkey = ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = 'public.knowledge_bases'::REGCLASS AND attname = 'id'),
        (SELECT attnum FROM pg_catalog.pg_attribute
         WHERE attrelid = 'public.knowledge_bases'::REGCLASS AND attname = 'owner_id')
      ]::SMALLINT[]
  ) <> 1 THEN
    RAISE EXCEPTION 'tag composite owner FK contract changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tags tag
    LEFT JOIN public.knowledge_bases knowledge_base
      ON knowledge_base.id = tag.knowledge_base_id
     AND knowledge_base.owner_id = tag.owner_id
    WHERE knowledge_base.id IS NULL
  ) THEN
    RAISE EXCEPTION 'tag owner/knowledge-base owner invariant is violated';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint catalog_constraint
    WHERE catalog_constraint.conrelid = receipt_relation
      AND catalog_constraint.contype = 'f'
  ) <> 2
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint catalog_constraint
      WHERE catalog_constraint.conrelid = receipt_relation
        AND catalog_constraint.contype = 'f'
        AND catalog_constraint.confrelid = 'auth.users'::REGCLASS
        AND catalog_constraint.convalidated
        AND NOT catalog_constraint.condeferrable
        AND NOT catalog_constraint.condeferred
        AND catalog_constraint.confmatchtype = 's'
        AND catalog_constraint.confupdtype = 'a'
        AND catalog_constraint.confdeltype = 'c'
        AND catalog_constraint.conkey = ARRAY[
          (SELECT attribute.attnum
           FROM pg_catalog.pg_attribute attribute
           WHERE attribute.attrelid = receipt_relation
             AND attribute.attname = 'owner_id')
        ]::SMALLINT[]
        AND catalog_constraint.confkey = ARRAY[
          (SELECT attribute.attnum
           FROM pg_catalog.pg_attribute attribute
           WHERE attribute.attrelid = 'auth.users'::REGCLASS
             AND attribute.attname = 'id')
        ]::SMALLINT[]
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint catalog_constraint
      WHERE catalog_constraint.conrelid = receipt_relation
        AND catalog_constraint.contype = 'f'
        AND catalog_constraint.confrelid = 'public.knowledge_bases'::REGCLASS
        AND catalog_constraint.convalidated
        AND NOT catalog_constraint.condeferrable
        AND NOT catalog_constraint.condeferred
        AND catalog_constraint.confmatchtype = 's'
        AND catalog_constraint.confupdtype = 'a'
        AND catalog_constraint.confdeltype = 'c'
        AND catalog_constraint.conkey = ARRAY[
          (SELECT attribute.attnum
           FROM pg_catalog.pg_attribute attribute
           WHERE attribute.attrelid = receipt_relation
             AND attribute.attname = 'knowledge_base_id')
        ]::SMALLINT[]
        AND catalog_constraint.confkey = ARRAY[
          (SELECT attribute.attnum
           FROM pg_catalog.pg_attribute attribute
           WHERE attribute.attrelid = 'public.knowledge_bases'::REGCLASS
             AND attribute.attname = 'id')
        ]::SMALLINT[]
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint catalog_constraint
      WHERE catalog_constraint.conrelid = receipt_relation
        AND catalog_constraint.contype = 'f'
        AND catalog_constraint.conkey = ARRAY[
          (SELECT attribute.attnum
           FROM pg_catalog.pg_attribute attribute
           WHERE attribute.attrelid = receipt_relation
             AND attribute.attname = 'document_id')
        ]::SMALLINT[]
    )
  THEN
    RAISE EXCEPTION 'receipt lifecycle FK contract changed';
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
    RAISE EXCEPTION 'wouldkeep_private appears in a PostgREST exposed-schema setting';
  END IF;

  FOR required_table, required_privileges IN
    SELECT * FROM (VALUES
      ('public.knowledge_bases', 'SELECT'),
      ('public.documents', 'SELECT,INSERT,UPDATE'),
      ('public.document_versions', 'INSERT'),
      ('public.tags', 'SELECT,INSERT,UPDATE'),
      ('public.document_tags', 'INSERT,DELETE'),
      ('public.document_links', 'SELECT,INSERT,DELETE'),
      ('public.document_sources', 'INSERT,DELETE'),
      ('wouldkeep_private.document_save_receipts', 'SELECT,INSERT')
    ) AS required(table_name, privileges)
  LOOP
    IF NOT has_table_privilege('postgres', required_table, required_privileges) THEN
      RAISE EXCEPTION 'atomic save owner lacks % on %', required_privileges, required_table;
    END IF;
  END LOOP;

  SELECT array_agg(version ORDER BY version)
  INTO actual_ledger
  FROM supabase_migrations.schema_migrations;

  IF actual_ledger IS DISTINCT FROM expected_ledger
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 21
    OR (
      SELECT count(DISTINCT version)
      FROM supabase_migrations.schema_migrations
    ) <> 21
    OR (
      SELECT count(*)
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000150'
        AND name = 'normalize_existing_tags_for_atomic_save'
    ) <> 1
    OR (
      SELECT count(*)
      FROM supabase_migrations.schema_migrations
      WHERE version = '20260722000200'
        AND name = 'atomic_document_snapshot_save'
    ) <> 1
  THEN
    RAISE EXCEPTION 'post-deployment migration ledger mismatch';
  END IF;

  RAISE NOTICE 'atomic_document_snapshot_contract_passed';
END;
$atomic_save_contract$;
