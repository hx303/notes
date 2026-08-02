ARG SUPABASE_POSTGRES_IMAGE="public.ecr.aws/supabase/postgres:17.6.1.143@sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8"

FROM ${SUPABASE_POSTGRES_IMAGE}

COPY input/supabase/tests/20260722_tag_write_pause_sealed_postgresql.conf /opt/wouldkeep-db/postgresql.conf
COPY input/supabase/tests/20260722_tag_write_pause_sealed_pg_hba.conf /opt/wouldkeep-db/pg_hba.conf

RUN ["/bin/sh", "-c", "set -eu; test -s /opt/wouldkeep-db/postgresql.conf; test -s /opt/wouldkeep-db/pg_hba.conf; ! grep -Eiq '(password|secret|token|jwt)' /opt/wouldkeep-db/postgresql.conf /opt/wouldkeep-db/pg_hba.conf"]

USER postgres
STOPSIGNAL SIGINT
ENTRYPOINT ["/nix/var/nix/profiles/default/bin/postgres"]
