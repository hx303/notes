-- Read-only production-safe contract verification for 20260721000100.

DO $$
DECLARE
  trigger_function REGPROCEDURE :=
    'public.require_valid_document_link_endpoints()'::REGPROCEDURE;
  required_command TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.document_links link
    JOIN public.documents source_document
      ON source_document.id = link.from_document_id
    JOIN public.documents target_document
      ON target_document.id = link.to_document_id
    WHERE source_document.owner_id <> link.owner_id
       OR target_document.owner_id <> link.owner_id
       OR source_document.knowledge_base_id <> target_document.knowledge_base_id
  ) THEN
    RAISE EXCEPTION 'document_links contains a cross-owner or cross-knowledge-base row';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'require_valid_document_link_endpoints'
  ) <> 1 THEN
    RAISE EXCEPTION 'document-link trigger function overload set changed unexpectedly';
  END IF;

  IF NOT (
    SELECT procedure.prosecdef
      AND procedure.prorettype = 'trigger'::REGTYPE
      AND procedure.provolatile = 'v'
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid = trigger_function
  ) THEN
    RAISE EXCEPTION 'document-link trigger function security contract changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) acl
    WHERE procedure.oid = trigger_function
      AND acl.grantee IN (
        0,
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'),
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
      )
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'an application role can execute the document-link trigger function directly';
  END IF;

  IF (
    SELECT COUNT(*)
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
    RAISE EXCEPTION 'document-link endpoint trigger is missing, disabled, or changed';
  END IF;

  IF NOT (
    SELECT relation.relrowsecurity
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'document_links'
  ) THEN
    RAISE EXCEPTION 'document_links RLS is disabled';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'document_links'
  ) <> 4 THEN
    RAISE EXCEPTION 'document_links must have exactly four command-specific policies';
  END IF;

  FOREACH required_command IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
  LOOP
    IF (
      SELECT COUNT(*)
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename = 'document_links'
        AND policy.cmd = required_command
        AND policy.roles = ARRAY['authenticated']::NAME[]
        AND COALESCE(policy.qual, policy.with_check, '') LIKE '%auth.uid()%'
        AND COALESCE(policy.qual, policy.with_check, '') LIKE '%owner_id%'
    ) <> 1 THEN
      RAISE EXCEPTION 'document_links % owner policy is missing or changed', required_command;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'document_links'
      AND policy.cmd = 'UPDATE'
      AND policy.qual LIKE '%auth.uid()%'
      AND policy.qual LIKE '%owner_id%'
      AND policy.with_check LIKE '%auth.uid()%'
      AND policy.with_check LIKE '%owner_id%'
  ) THEN
    RAISE EXCEPTION 'document_links UPDATE policy must protect both old and new rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'document_links'
      AND policy.cmd IN ('SELECT', 'DELETE')
      AND policy.qual LIKE '%deleted_at%'
  ) THEN
    RAISE EXCEPTION
      'document_links SELECT and DELETE policies must preserve owner tombstone access';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'document_links'
      AND ('anon'::NAME = ANY(policy.roles) OR 'public'::NAME = ANY(policy.roles))
  ) THEN
    RAISE EXCEPTION 'document_links unexpectedly exposes an anon or PUBLIC RLS policy';
  END IF;

  IF has_table_privilege('anon', 'public.document_links', 'SELECT')
    OR has_table_privilege('anon', 'public.document_links', 'INSERT')
    OR has_table_privilege('anon', 'public.document_links', 'UPDATE')
    OR has_table_privilege('anon', 'public.document_links', 'DELETE') THEN
    RAISE EXCEPTION 'anon unexpectedly has direct document_links table privileges';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.document_links', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.document_links', 'INSERT')
    OR NOT has_table_privilege('authenticated', 'public.document_links', 'UPDATE')
    OR NOT has_table_privilege('authenticated', 'public.document_links', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated lost required document_links CRUD privileges';
  END IF;
END;
$$;
