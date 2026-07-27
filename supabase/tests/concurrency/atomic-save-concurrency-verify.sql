DO $$
DECLARE
  same_holder JSONB;
  same_contender JSONB;
  cas_holder JSONB;
  cas_contender JSONB;
BEGIN
  SELECT response INTO STRICT same_holder
  FROM atomic_save_concurrency.results
  WHERE test_case = 'same_op_new' AND session_name = 'holder';

  SELECT response INTO STRICT same_contender
  FROM atomic_save_concurrency.results
  WHERE test_case = 'same_op_new' AND session_name = 'contender';

  IF same_holder IS DISTINCT FROM same_contender
    OR same_holder->>'status' <> 'saved'
    OR same_holder->>'created' <> 'true'
    OR (SELECT count(*) FROM public.documents
        WHERE owner_id = 'a7220000-0000-4000-8000-000000000001'::UUID
          AND title = 'Concurrent exactly once') <> 1
    OR (SELECT count(*) FROM wouldkeep_private.document_save_receipts
        WHERE owner_id = 'a7220000-0000-4000-8000-000000000001'::UUID
          AND operation_id = 'concurrent-same-new') <> 1
    OR (SELECT count(*) FROM public.document_versions
        WHERE document_id = (same_holder->>'document_id')::UUID) <> 1
    OR (SELECT finished_at - started_at FROM atomic_save_concurrency.results
        WHERE test_case = 'same_op_new' AND session_name = 'contender') < interval '1 second'
  THEN
    RAISE EXCEPTION 'same-operation new-document exactly-once concurrency assertion failed';
  END IF;

  SELECT response INTO STRICT cas_holder
  FROM atomic_save_concurrency.results
  WHERE test_case = 'different_op_cas' AND session_name = 'holder';

  SELECT response INTO STRICT cas_contender
  FROM atomic_save_concurrency.results
  WHERE test_case = 'different_op_cas' AND session_name = 'contender';

  IF cas_holder->>'status' <> 'saved'
    OR cas_contender->>'status' <> 'conflict'
    OR cas_holder->>'revision' <> '1'
    OR cas_contender->>'current_revision' <> '1'
    OR (SELECT title FROM public.documents
        WHERE id = 'a7220000-0000-4000-8000-000000000201'::UUID) <> 'CAS holder won'
    OR (SELECT count(*) FROM public.document_versions
        WHERE document_id = 'a7220000-0000-4000-8000-000000000201'::UUID) <> 1
    OR (SELECT count(*) FROM wouldkeep_private.document_save_receipts
        WHERE owner_id = 'a7220000-0000-4000-8000-000000000001'::UUID
          AND operation_id IN ('concurrent-cas-holder', 'concurrent-cas-contender')) <> 1
    OR (SELECT finished_at - started_at FROM atomic_save_concurrency.results
        WHERE test_case = 'different_op_cas' AND session_name = 'contender') < interval '1 second'
  THEN
    RAISE EXCEPTION 'different-operation CAS concurrency assertion failed';
  END IF;

  IF (SELECT response->>'status' FROM atomic_save_concurrency.results
      WHERE test_case = 'knowledge_base_delete' AND session_name = 'save_holder') <> 'saved'
    OR (SELECT response->>'status' FROM atomic_save_concurrency.results
        WHERE test_case = 'knowledge_base_delete' AND session_name = 'delete_contender') <> 'deleted'
    OR EXISTS (
      SELECT 1 FROM public.knowledge_bases
      WHERE id = 'a7220000-0000-4000-8000-000000000103'::UUID
    )
    OR EXISTS (
      SELECT 1 FROM public.documents
      WHERE knowledge_base_id = 'a7220000-0000-4000-8000-000000000103'::UUID
    )
    OR EXISTS (
      SELECT 1 FROM wouldkeep_private.document_save_receipts
      WHERE knowledge_base_id = 'a7220000-0000-4000-8000-000000000103'::UUID
    )
    OR (SELECT finished_at - started_at FROM atomic_save_concurrency.results
        WHERE test_case = 'knowledge_base_delete' AND session_name = 'delete_contender') < interval '1 second'
  THEN
    RAISE EXCEPTION 'knowledge-base delete lock-order/cascade assertion failed';
  END IF;
END;
$$;

SELECT
  'same-op new exactly once, different-op CAS, and knowledge-base delete lock order passed'
    AS result;
