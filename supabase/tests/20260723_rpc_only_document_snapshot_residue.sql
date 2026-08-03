-- Run immediately after the rollback-only 20260723 behavior matrix.
-- This read-only probe must return zero for every fixture class.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE email IN (
      'rpc-only-acl-owner@example.test',
      'rpc-only-acl-other@example.test'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.knowledge_bases
    WHERE name LIKE 'RPC-only ACL rollback fixture%'
  ) OR EXISTS (
    SELECT 1 FROM public.documents
    WHERE title LIKE 'RPC-only ACL%'
  ) OR EXISTS (
    SELECT 1 FROM wouldkeep_private.document_save_receipts
    WHERE operation_id LIKE 'rpc-only-acl-%'
  ) THEN
    RAISE EXCEPTION 'rollback-only RPC ACL matrix left fixture residue';
  END IF;
END;
$$;

SELECT
  (SELECT count(*) FROM auth.users
   WHERE email LIKE 'rpc-only-acl-%@example.test') AS users,
  (SELECT count(*) FROM public.knowledge_bases
   WHERE name LIKE 'RPC-only ACL rollback fixture%') AS knowledge_bases,
  (SELECT count(*) FROM public.documents
   WHERE title LIKE 'RPC-only ACL%') AS documents,
  (SELECT count(*) FROM wouldkeep_private.document_save_receipts
   WHERE operation_id LIKE 'rpc-only-acl-%') AS receipts,
  'rpc_only_document_snapshot_rollback_residue_zero' AS result;
