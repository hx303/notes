-- Run after every positive, rejected-confirmation, collision, and invalid fixture.
-- All seven counts must be zero; this statement is read-only and production-safe.

SELECT
  (SELECT count(*) FROM auth.users
   WHERE id IN (
     'a1500000-0000-4000-8000-000000000100'::UUID,
     'a1500000-0000-4000-8000-000000000200'::UUID,
     'a1500000-0000-4000-8000-000000000300'::UUID
   ) OR email LIKE 'p1b-tag-normalization-%@example.test') AS users,
  (SELECT count(*) FROM public.profiles
   WHERE id IN (
     'a1500000-0000-4000-8000-000000000100'::UUID,
     'a1500000-0000-4000-8000-000000000200'::UUID,
     'a1500000-0000-4000-8000-000000000300'::UUID
   )) AS profiles,
  (SELECT count(*) FROM public.knowledge_bases
   WHERE id::TEXT LIKE 'b1500000-0000-4000-8000-%') AS knowledge_bases,
  (SELECT count(*) FROM public.documents
   WHERE id::TEXT LIKE 'd1500000-0000-4000-8000-%') AS documents,
  (SELECT count(*) FROM public.tags
   WHERE id::TEXT LIKE 'c1500000-0000-4000-8000-%') AS tags,
  (SELECT count(*) FROM public.document_tags
   WHERE tag_id::TEXT LIKE 'c1500000-0000-4000-8000-%') AS document_tags,
  (SELECT count(*) FROM public.tags
   WHERE left(
     normalized_name,
     char_length('__wouldkeep_tmp_22000150_')
   ) = '__wouldkeep_tmp_22000150_') AS temporary_keys,
  'tag_normalization_rollback_residue_zero' AS result;
