#!/usr/bin/env bash
# Copies sim/<demo>/project/ into the demo project's ignition/ directory on the gateway host
# (never deleting anything already there), restarts the gateway service and waits for StatusPing.
#
#   IGNITE_URL=<gateway>/data/ignite sim/scripts/install-project.sh <ssh-host> <project-dir> [demo=launch]
#
#   <ssh-host>     e.g. user@gateway (key auth; the user must own the install and may run sudo systemctl)
#   <project-dir>  absolute path of <data>/projects/<project>/ignition on the gateway
#
# On-disk timer and library resources are only picked up by a gateway restart (see
# docs/reference/ignition-8.3-project-files.md in the ignite repo), hence the restart.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: IGNITE_URL=<gateway>/data/ignite $0 <ssh-host> <project-dir> [demo=launch]" >&2
  exit 2
fi
host="$1"
dest="${2%/}"
demo="${3:-launch}"
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../$demo/project/"
[ -d "$src" ] || { echo "no such directory: $src" >&2; exit 2; }
: "${IGNITE_URL:?set IGNITE_URL (gateway base + /data/ignite) so StatusPing can be polled}"
ping_url="${IGNITE_URL%/data/ignite}/StatusPing"

echo "copying $src -> $host:$dest/ (no delete)"
rsync -rt --chmod=D775,F664 --exclude=__pycache__ --exclude="*.pyc" "$src" "$host:$dest/"

echo "restart at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
ssh "$host" 'sudo systemctl restart Ignition-Gateway'
for i in $(seq 1 90); do
  if curl -fsS -m 3 "$ping_url" 2>/dev/null | grep -q RUNNING; then
    echo "gateway RUNNING at $(date -u +%Y-%m-%dT%H:%M:%SZ) (poll $i)"
    exit 0
  fi
  sleep 2
done
echo "gateway did not report RUNNING within 180 s" >&2
exit 1
