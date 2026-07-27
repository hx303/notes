-- Run immediately after the rollback-only 20260722000200 behavior matrix.
-- This production-safe, read-only probe must return zero for every fixture class.

DO $atomic_save_residue$
DECLARE
  fixture_users BIGINT;
  fixture_knowledge_bases BIGINT;
  fixture_tags BIGINT;
  fixture_receipts BIGINT;
BEGIN
  SELECT count(*) INTO fixture_users
  FROM auth.users
    WHERE email = 'atomic-save-account-cleanup@example.test'
  ;

  SELECT count(*) INTO fixture_knowledge_bases
  FROM public.knowledge_bases
    WHERE name IN (
      'Atomic save owner library',
      'Atomic save second owner library',
      'Atomic save other library',
      'Atomic save cascade library',
      'Atomic cleanup library'
    )
  ;

  SELECT count(*) INTO fixture_tags
  FROM public.tags
    WHERE normalized_name IN (
      'p1b historical cross owner squat',
      'p1b cross owner squat',
      'p1b authenticated cross account squat',
      'p1b reverse owner guard',
      'p1b duplicate cascade tag',
      'p1b account cascade tag'
    )
  ;

  SELECT count(*) INTO fixture_receipts
  FROM wouldkeep_private.document_save_receipts
    WHERE operation_id IN (
      'op-account-cleanup', 'op-conflict-1', 'op-cross-kb-relation',
      'op-cross-kb-source', 'op-deleted-source', 'op-duplicate-source',
      'op-force-rollback', 'op-missing-kb', 'op-new-1', 'op-orphan-deleted',
      'op-ready-1', 'op-save-1', 'op-save-2', 'op-secret-url',
      'op-unsafe-revision'
    )
  ;

  IF fixture_users <> 0 OR fixture_knowledge_bases <> 0
    OR fixture_tags <> 0 OR fixture_receipts <> 0
  THEN
    RAISE EXCEPTION 'rollback-only atomic-save matrix left fixture residue';
  END IF;

  RAISE NOTICE
    '0,0,0,0,atomic_document_snapshot_rollback_residue_zero';
END;
$atomic_save_residue$;
