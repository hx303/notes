-- Phase 3 Fix: Tell PostgREST about comments → profiles relationship
-- Both comments.user_id and profiles.id reference auth.users.id,
-- but PostgREST needs an explicit hint to resolve the join
COMMENT ON CONSTRAINT comments_user_id_fkey ON public.comments IS
  E'@foreignKey (user_id) references profiles (id)';
