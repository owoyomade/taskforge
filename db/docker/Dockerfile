# Local development database: the official Postgres 17 image plus pgTAP,
# the testing extension our database tests are written in, and pg_prove,
# the command that runs them. Production (Neon) runs the same Postgres
# version, so what passes here behaves the same there.
FROM postgres:17

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-17-pgtap libtap-parser-sourcehandler-pgtap-perl \
  && rm -rf /var/lib/apt/lists/*
