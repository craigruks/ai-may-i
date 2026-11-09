#!/bin/sh
# Stand-in for your migration runner: it reads one secret, so its env file names one.
set -eu
psql "$DATABASE_URL" -f migrations/latest.sql
