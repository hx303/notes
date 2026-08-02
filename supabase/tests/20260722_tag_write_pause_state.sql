-- Production-safe, read-only catalog state for the temporary tag-write pause.
-- Partial or drifted gate objects raise instead of reporting a usable state.

DO $tag_write_pause_state_guard$
DECLARE
  gate_schema_oid oid;
  gate_function_oid oid;
  gate_owner_oid oid;
  tags_oid oid := 'public.tags'::regclass::oid;
  document_tags_oid oid := 'public.document_tags'::regclass::oid;
  tags_trigger_oid oid;
  document_tags_trigger_oid oid;
  schema_count integer;
  function_count integer;
  trigger_count integer;
  expected_body text := $expected_body$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'wouldkeep_tag_writes_paused';
END;
$expected_body$;
BEGIN
  SELECT count(*) INTO schema_count
  FROM pg_catalog.pg_namespace
  WHERE nspname = 'wouldkeep_maintenance';

  SELECT count(*) INTO function_count
  FROM pg_catalog.pg_proc function
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = function.pronamespace
  WHERE namespace.nspname = 'wouldkeep_maintenance'
     OR function.proname = 'reject_tag_write_while_paused';

  SELECT count(*) INTO trigger_count
  FROM pg_catalog.pg_trigger trigger
  WHERE trigger.tgname IN (
    'wouldkeep_tags_write_pause',
    'wouldkeep_document_tags_write_pause'
  );

  IF (SELECT relowner FROM pg_catalog.pg_class WHERE oid = tags_oid)
       <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = document_tags_oid)
       <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = tags_oid)
       <> (SELECT relowner FROM pg_catalog.pg_class WHERE oid = document_tags_oid) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_owner_mismatch';
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

  IF schema_count = 0 AND function_count = 0 AND trigger_count = 0 THEN
    RETURN;
  END IF;

  IF schema_count <> 1 OR function_count <> 1 OR trigger_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_partial_state';
  END IF;

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

  IF gate_owner_oid <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
     OR gate_owner_oid <> (SELECT relowner FROM pg_catalog.pg_class WHERE oid = tags_oid)
     OR gate_owner_oid <> (SELECT relowner FROM pg_catalog.pg_class WHERE oid = document_tags_oid)
     OR pg_catalog.obj_description(gate_schema_oid, 'pg_namespace') <>
       'wouldkeep temporary tag-write pause gate; remove only with the reviewed disable operation'
     OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace = gate_schema_oid) <> 1
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
     OR (SELECT count(*) FROM pg_catalog.pg_ts_template WHERE tmplnamespace = gate_schema_oid) <> 0
     OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgfoid = gate_function_oid) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_catalog_drift';
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
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_acl_drift';
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
$tag_write_pause_state_guard$;

WITH target_relations(relation_oid, relation_name) AS (
  VALUES
    ('public.tags'::regclass::oid, 'tags'::text),
    ('public.document_tags'::regclass::oid, 'document_tags'::text)
), relation_catalog AS (
  SELECT encode(sha256(convert_to(string_agg(
    concat_ws(chr(31), target.relation_name, relation.oid::text,
      relation.relowner::text, relation.relkind::text, relation.relpersistence::text,
      relation.relrowsecurity::text, relation.relforcerowsecurity::text,
      relation.relreplident::text),
    chr(30) ORDER BY target.relation_name COLLATE "C"
  ), 'UTF8')), 'hex') AS fingerprint
  FROM target_relations target
  JOIN pg_catalog.pg_class relation ON relation.oid = target.relation_oid
), relation_acl AS (
  SELECT encode(sha256(convert_to(COALESCE(string_agg(
    concat_ws(chr(31), target.relation_name, acl.grantor::text, acl.grantee::text,
      acl.privilege_type, acl.is_grantable::text),
    chr(30) ORDER BY target.relation_name COLLATE "C", acl.grantor,
      acl.grantee, acl.privilege_type COLLATE "C"
  ), ''), 'UTF8')), 'hex') AS fingerprint
  FROM target_relations target
  JOIN pg_catalog.pg_class relation ON relation.oid = target.relation_oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) acl
), relation_policies AS (
  SELECT encode(sha256(convert_to(COALESCE(string_agg(
    concat_ws(chr(31), target.relation_name, policy.oid::text, policy.polname,
      policy.polpermissive::text, policy.polroles::text, policy.polcmd::text,
      COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false), ''),
      COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false), '')),
    chr(30) ORDER BY target.relation_name COLLATE "C", policy.polname COLLATE "C"
  ), ''), 'UTF8')), 'hex') AS fingerprint
  FROM target_relations target
  LEFT JOIN pg_catalog.pg_policy policy ON policy.polrelid = target.relation_oid
), nongate_triggers AS (
  SELECT encode(sha256(convert_to(COALESCE(string_agg(
    concat_ws(chr(31), target.relation_name, trigger.oid::text, trigger.tgname,
      trigger.tgenabled::text, trigger.tgtype::text, trigger.tgfoid::text,
      pg_catalog.pg_get_triggerdef(trigger.oid, false),
      COALESCE(pg_catalog.obj_description(trigger.oid, 'pg_trigger'), '')),
    chr(30) ORDER BY target.relation_name COLLATE "C", trigger.tgname COLLATE "C"
  ), ''), 'UTF8')), 'hex') AS fingerprint
  FROM target_relations target
  LEFT JOIN pg_catalog.pg_trigger trigger
    ON trigger.tgrelid = target.relation_oid
   AND NOT trigger.tgisinternal
   AND trigger.tgname NOT IN (
     'wouldkeep_tags_write_pause',
     'wouldkeep_document_tags_write_pause'
   )
), gate AS (
  SELECT
    namespace.oid AS schema_oid,
    function.oid AS function_oid,
    tags_trigger.oid AS tags_trigger_oid,
    document_tags_trigger.oid AS document_tags_trigger_oid
  FROM pg_catalog.pg_namespace namespace
  JOIN pg_catalog.pg_proc function
    ON function.pronamespace = namespace.oid
   AND function.proname = 'reject_tag_write_while_paused'
   AND function.pronargs = 0
  JOIN pg_catalog.pg_trigger tags_trigger
    ON tags_trigger.tgfoid = function.oid
   AND tags_trigger.tgrelid = 'public.tags'::regclass
   AND tags_trigger.tgname = 'wouldkeep_tags_write_pause'
  JOIN pg_catalog.pg_trigger document_tags_trigger
    ON document_tags_trigger.tgfoid = function.oid
   AND document_tags_trigger.tgrelid = 'public.document_tags'::regclass
   AND document_tags_trigger.tgname = 'wouldkeep_document_tags_write_pause'
  WHERE namespace.nspname = 'wouldkeep_maintenance'
)
SELECT concat(
  'tag_write_pause_state|gate=', CASE WHEN gate.schema_oid IS NULL THEN 'absent' ELSE 'active' END,
  '|catalog=', relation_catalog.fingerprint,
  '|acl=', relation_acl.fingerprint,
  '|rls_policies=', relation_policies.fingerprint,
  '|nongate_triggers=', nongate_triggers.fingerprint,
  '|schema_oid=', COALESCE(gate.schema_oid::text, '0'),
  '|function_oid=', COALESCE(gate.function_oid::text, '0'),
  '|tags_trigger_oid=', COALESCE(gate.tags_trigger_oid::text, '0'),
  '|document_tags_trigger_oid=', COALESCE(gate.document_tags_trigger_oid::text, '0')
) AS result
FROM relation_catalog
CROSS JOIN relation_acl
CROSS JOIN relation_policies
CROSS JOIN nongate_triggers
LEFT JOIN gate ON true;
