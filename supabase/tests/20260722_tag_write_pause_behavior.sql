-- Production-safe behavior probe. Every statement is deliberately zero-row.
-- TRUNCATE is verified only in disposable tests and is forbidden here.

DO $tag_write_pause_behavior$
DECLARE
  operator_role name := current_user;
  probe_role name;
  probe record;
  baseline_authorized boolean;
  write_authorized boolean;
  read_authorized boolean;
  observed_state text;
  observed_message text;
  roles_checked integer := 0;
  statements_checked integer := 0;
  gate_blocks integer := 0;
  acl_blocks integer := 0;
BEGIN
  FOR probe_role IN
    SELECT role_name
    FROM unnest(ARRAY[operator_role, 'anon'::name, 'authenticated'::name, 'service_role'::name])
      AS expected(role_name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = probe_role) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_probe_role_missing';
    END IF;
    roles_checked := roles_checked + 1;

    FOR probe IN
      SELECT *
      FROM (VALUES
        ('tags_insert', 'public.tags'::regclass, 'INSERT'::text,
          ARRAY['id', 'knowledge_base_id', 'owner_id', 'name', 'normalized_name']::text[],
          ARRAY[]::text[], $sql$INSERT INTO public.tags
          (id, knowledge_base_id, owner_id, name, normalized_name)
          SELECT NULL::uuid, NULL::uuid, NULL::uuid, ''::text, ''::text WHERE false$sql$),
        ('tags_update', 'public.tags'::regclass, 'UPDATE'::text,
          ARRAY['name']::text[], ARRAY['name']::text[],
          $sql$UPDATE public.tags SET name = name WHERE false$sql$),
        ('tags_delete', 'public.tags'::regclass, 'DELETE'::text,
          ARRAY[]::text[], ARRAY[]::text[],
          $sql$DELETE FROM public.tags WHERE false$sql$),
        ('document_tags_insert', 'public.document_tags'::regclass, 'INSERT'::text,
          ARRAY['document_id', 'tag_id', 'owner_id']::text[], ARRAY[]::text[],
          $sql$INSERT INTO public.document_tags
          (document_id, tag_id, owner_id)
          SELECT NULL::uuid, NULL::uuid, NULL::uuid WHERE false$sql$),
        ('document_tags_update', 'public.document_tags'::regclass, 'UPDATE'::text,
          ARRAY['owner_id']::text[], ARRAY['owner_id']::text[],
          $sql$UPDATE public.document_tags SET owner_id = owner_id WHERE false$sql$),
        ('document_tags_delete', 'public.document_tags'::regclass, 'DELETE'::text,
          ARRAY[]::text[], ARRAY[]::text[],
          $sql$DELETE FROM public.document_tags WHERE false$sql$)
      ) AS probes(
        probe_name, relation_oid, privilege_name, write_columns, read_columns, statement_text
      )
    LOOP
      write_authorized := pg_catalog.has_table_privilege(
        probe_role, probe.relation_oid, probe.privilege_name
      ) OR (
        pg_catalog.cardinality(probe.write_columns) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(probe.write_columns) AS required(column_name)
          WHERE NOT pg_catalog.has_column_privilege(
            probe_role, probe.relation_oid, required.column_name, probe.privilege_name
          )
        )
      );
      read_authorized := pg_catalog.cardinality(probe.read_columns) = 0 OR
        pg_catalog.has_table_privilege(probe_role, probe.relation_oid, 'SELECT') OR
        NOT EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(probe.read_columns) AS required(column_name)
          WHERE NOT pg_catalog.has_column_privilege(
            probe_role, probe.relation_oid, required.column_name, 'SELECT'
          )
        );
      baseline_authorized := write_authorized AND read_authorized;

      EXECUTE format('SET LOCAL ROLE %I', probe_role);
      observed_state := NULL;
      observed_message := NULL;
      BEGIN
        EXECUTE probe.statement_text;
      EXCEPTION
        WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS
            observed_state = RETURNED_SQLSTATE,
            observed_message = MESSAGE_TEXT;
      END;
      RESET ROLE;
      statements_checked := statements_checked + 1;

      IF baseline_authorized THEN
        IF observed_state IS DISTINCT FROM '55000'
           OR observed_message IS DISTINCT FROM 'wouldkeep_tag_writes_paused' THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'wouldkeep_tag_write_pause_behavior_mismatch',
            DETAIL = format('role=%s probe=%s expected=gate state=%s',
              probe_role, probe.probe_name, COALESCE(observed_state, 'none'));
        END IF;
        gate_blocks := gate_blocks + 1;
      ELSE
        IF observed_state IS DISTINCT FROM '42501' THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'wouldkeep_tag_write_pause_behavior_mismatch',
            DETAIL = format('role=%s probe=%s expected=acl state=%s',
              probe_role, probe.probe_name, COALESCE(observed_state, 'none'));
        END IF;
        acl_blocks := acl_blocks + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF roles_checked <> 4
     OR statements_checked <> 24
     OR gate_blocks < 6
     OR gate_blocks + acl_blocks <> 24 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'wouldkeep_tag_write_pause_behavior_count_mismatch';
  END IF;
  RAISE NOTICE 'tag_write_pause_behavior_counts|roles=%|statements=%|gate_blocks=%|acl_blocks=%',
    roles_checked, statements_checked, gate_blocks, acl_blocks;
END;
$tag_write_pause_behavior$;

SELECT
  'tag_write_pause_behavior_passed' AS result,
  4::integer AS roles_checked,
  24::integer AS statements_checked,
  '55000,42501'::text AS exact_block_sqlstates,
  6::integer AS minimum_gate_blocks;
