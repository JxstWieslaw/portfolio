#!/usr/bin/env bash
# Fails when the model test seam is present in a build directory, and ALSO when the
# check itself could not run (missing directory, grep error): a guard must not fail open.
# Usage: check-no-model-seam.sh <dir>
set -euo pipefail
dir="${1:?usage: check-no-model-seam.sh <dir>}"
test -d "$dir" || { echo "seam guard could not run: $dir is not a directory"; exit 1; }
set +e
grep -rlE "__ASSEMBLY_MODELS_TEST__|__ASSEMBLY_DEBUG__|__ASSEMBLY_VELOCITY__|__ASSEMBLY_HERO__" "$dir"
rc=$?
set -e
[ "$rc" -eq 1 ] || { echo "seam present or guard could not run (grep rc=$rc)"; exit 1; }
echo "model test seam absent from $dir"
