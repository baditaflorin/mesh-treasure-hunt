#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
common_dir="$(dirname "$repo_root")/mesh-common"
common_url="https://github.com/baditaflorin/mesh-common.git"
common_sha="7fda31aa82603cb63414932b565173db281728aa"

if [[ -e "$common_dir" ]]; then
  if ! git -C "$common_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Refusing to replace non-Git sibling at $common_dir" >&2
    exit 1
  fi
  if [[ "$(git -C "$common_dir" remote get-url origin)" != "$common_url" ]]; then
    echo "Refusing sibling whose origin is not the canonical mesh-common repository" >&2
    exit 1
  fi
  if [[ -n "$(git -C "$common_dir" status --porcelain)" ]]; then
    echo "Refusing to change a dirty mesh-common sibling at $common_dir" >&2
    exit 1
  fi
else
  mkdir -p "$common_dir"
  git -C "$common_dir" init --quiet
  git -C "$common_dir" remote add origin "$common_url"
  git -C "$common_dir" sparse-checkout init --no-cone
  git -C "$common_dir" sparse-checkout set --no-cone \
    '/package.json' '/package-lock.json' '/README.md' '/LICENSE' \
    '/src/**' '/testing/**' '/scaffold/**' '/scripts/**' '/presets/**'
fi

git -C "$common_dir" fetch --quiet --depth 1 --filter=blob:none origin "$common_sha"
git -C "$common_dir" checkout --quiet --detach "$common_sha"
if [[ "$(git -C "$common_dir" rev-parse HEAD)" != "$common_sha" ]]; then
  echo "mesh-common checkout did not match its pinned commit" >&2
  exit 1
fi
if [[ ! -f "$common_dir/package-lock.json" ]]; then
  echo "Pinned mesh-common commit has no lockfile; refusing nondeterministic install" >&2
  exit 1
fi
npm ci --prefix "$common_dir"
