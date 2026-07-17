\set ON_ERROR_STOP on

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_bases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT ON public.document_tags, public.tags, public.document_sources TO authenticated;

DELETE FROM public.knowledge_bases WHERE id = 'ad000000-0000-4000-8000-000000000000';
INSERT INTO public.knowledge_bases (id, owner_id, name)
VALUES ('ad000000-0000-4000-8000-000000000000', :'owner_id', 'P1 update concurrency');

INSERT INTO public.documents (id, knowledge_base_id, owner_id, title, body, status)
VALUES
  ('ad100000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000000', :'owner_id', 'update first', 'body', 'ready'),
  ('ad200000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000000', :'owner_id', 'delete first', 'body', 'ready');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', FALSE);
SELECT set_config('request.jwt.claim.sub', :'owner_id', FALSE);
SELECT public.publish_document('ad100000-0000-4000-8000-000000000001', 'public');
SELECT public.publish_document('ad200000-0000-4000-8000-000000000002', 'public');
RESET ROLE;
