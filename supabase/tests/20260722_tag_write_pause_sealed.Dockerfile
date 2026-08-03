ARG POWERSHELL_IMAGE="mcr.microsoft.com/powershell:7.5-debian-12@sha256:7ab5bd5ca6f95a3351fa0c6a1205237d57048c94542355aab55519a0861a9b25"
ARG POSTGRES_RUNNER_IMAGE="public.ecr.aws/docker/library/postgres:17.6-bookworm@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3"

FROM ${POSTGRES_RUNNER_IMAGE} AS postgres_client

FROM ${POWERSHELL_IMAGE}

# Copy the real PG17 binaries, never Debian's wrapper shim. The explicit library
# closure comes from the same immutable PG17 stage; no package manager or
# network installer is allowed in this build.
COPY --from=postgres_client /usr/lib/postgresql/17/bin/psql /opt/pg17/bin/psql
COPY --from=postgres_client /usr/lib/postgresql/17/bin/pg_isready /opt/pg17/bin/pg_isready
COPY --from=postgres_client /usr/lib/x86_64-linux-gnu/libpq.so.5* /opt/pg17/lib/
COPY --from=postgres_client /usr/lib/x86_64-linux-gnu/libreadline.so.8* /opt/pg17/lib/
COPY --from=postgres_client /usr/lib/x86_64-linux-gnu/libldap-2.5.so.0* /opt/pg17/lib/
COPY --from=postgres_client /usr/lib/x86_64-linux-gnu/liblber-2.5.so.0* /opt/pg17/lib/
COPY --from=postgres_client /usr/lib/x86_64-linux-gnu/libsasl2.so.2* /opt/pg17/lib/

ENV LD_LIBRARY_PATH=/opt/pg17/lib

COPY input-manifest.sha256 /opt/wouldkeep/input-manifest.sha256
COPY input /opt/wouldkeep/input

RUN ["/bin/sh", "-c", "set -eu; ! ldd /opt/pg17/bin/psql | grep -F 'not found'; ! ldd /opt/pg17/bin/pg_isready | grep -F 'not found'; /opt/microsoft/powershell/7/pwsh -NoLogo -NoProfile -Command '$v=$PSVersionTable.PSVersion; if ($v.Major -ne 7 -or $v.Minor -ne 5) { throw \"PowerShell 7.5 is required\" }; \"wouldkeep_sealed_powershell_verified\"'; /opt/pg17/bin/psql --version | grep -E '^psql \\(PostgreSQL\\) 17\\.6([ .]|$)'; /opt/pg17/bin/pg_isready --version | grep -E '^pg_isready \\(PostgreSQL\\) 17\\.6([ .]|$)'; /opt/microsoft/powershell/7/pwsh -NoLogo -NoProfile -File /opt/wouldkeep/input/supabase/tests/20260722_tag_write_pause_sealed_container.ps1 -Mode VerifyInput -InputRoot /opt/wouldkeep/input -ManifestPath /opt/wouldkeep/input-manifest.sha256"]

RUN ["/bin/sh", "-c", "set -eu; for path in /root/.supabase/access-token /root/.config/supabase/access-token /home/postgres/.supabase/access-token /home/postgres/.config/supabase/access-token; do test ! -e \"$path\"; done"]

USER 65534:65534
ENTRYPOINT ["/opt/microsoft/powershell/7/pwsh", "-NoLogo", "-NoProfile", "-File", "/opt/wouldkeep/input/supabase/tests/20260722_tag_write_pause_sealed_container.ps1"]
CMD ["-Mode", "Run", "-InputRoot", "/opt/wouldkeep/input", "-ManifestPath", "/opt/wouldkeep/input-manifest.sha256", "-EvidenceDirectory", "/evidence"]
