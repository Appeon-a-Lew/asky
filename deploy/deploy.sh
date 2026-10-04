#!/bin/sh
# Runs on the server as the forced command of the GitHub deploy key:
#   ssh root@host "<tag> <github-actor>"   with the workflow's GITHUB_TOKEN on stdin.
# Pulls that image from ghcr.io and restarts asky. Nothing else can be run with the key.
set -euf  # -f: no filename expansion of the words below
set -- ${SSH_ORIGINAL_COMMAND:-}
TAG="${1:-}"
ACTOR="${2:-deploy}"
case "$TAG" in "" | *[!A-Za-z0-9._-]*) echo "usage: <tag> <actor>" >&2; exit 2 ;; esac
case "$ACTOR" in *[!A-Za-z0-9-]*) echo "bad actor" >&2; exit 2 ;; esac

cd /opt/asky
docker login ghcr.io -u "$ACTOR" --password-stdin >/dev/null
sed -i "s/^ASKY_TAG=.*/ASKY_TAG=$TAG/" .env
docker compose pull -q asky
docker compose up -d asky
docker logout ghcr.io >/dev/null 2>&1 || true
docker image prune -f >/dev/null
sleep 5
docker compose ps asky --format '{{.Service}} {{.Image}} {{.Status}}'
