#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

# Legacy CentOS 7 deployment: publish prebuilt static files only.
# No Node.js, npm, Docker, or server-side compilation is performed.

APP_NAME="${APP_NAME:-ai-note}"
REPO_URL="${REPO_URL:-https://github.com/changeme2012/ai-note.git}"
BRANCH="${BRANCH:-main}"
STATIC_DIR="${STATIC_DIR:-site}"
APP_ROOT="${APP_ROOT:-/opt/ai-note}"
REPO_DIR="${REPO_DIR:-${APP_ROOT}/repo}"
RELEASES_DIR="${RELEASES_DIR:-${APP_ROOT}/releases}"
CURRENT_LINK="${CURRENT_LINK:-${APP_ROOT}/current}"
LOCK_FILE="${LOCK_FILE:-/var/lock/subsys/${APP_NAME}-deploy.lock}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

log() {
  printf '%s [%s] %s\n' "$(date '+%F %T')" "$APP_NAME" "$*"
}

# CentOS 7 ships Git 1.8.3, while the global `git -C` option was added
# in Git 1.8.5. Run repository commands from a subshell for compatibility.
git_repo() {
  (cd "$REPO_DIR" && git "$@")
}

for required in git flock tar find sort awk readlink; do
  command -v "$required" >/dev/null 2>&1 || {
    log "ERROR: required command not found: $required"
    exit 1
  }
done

mkdir -p "$APP_ROOT" "$RELEASES_DIR" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another deployment is running; skipping this cron tick."
  exit 0
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  log "Cloning $REPO_URL"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$REPO_DIR"
fi

log "Fetching origin/$BRANCH"
git_repo fetch --quiet --prune origin "$BRANCH"
remote_sha="$(git_repo rev-parse "origin/$BRANCH")"
deployed_sha=""
[[ -f "$APP_ROOT/DEPLOYED_SHA" ]] && deployed_sha="$(<"$APP_ROOT/DEPLOYED_SHA")"

if [[ "$remote_sha" == "$deployed_sha" && -L "$CURRENT_LINK" ]]; then
  log "Already deployed ${remote_sha:0:12}; nothing to do."
  exit 0
fi

# Refuse to destroy edits made directly in the server checkout.
git_repo checkout --quiet "$BRANCH"
git_repo merge-base --is-ancestor HEAD "origin/$BRANCH" || {
  log "ERROR: server checkout diverged from origin/$BRANCH; resolve manually."
  exit 1
}
git_repo merge --quiet --ff-only "origin/$BRANCH"

if ! git_repo cat-file -e "${remote_sha}:${STATIC_DIR}/index.html" 2>/dev/null; then
  log "ERROR: ${STATIC_DIR}/index.html does not exist in ${remote_sha:0:12}."
  log "Publish the static website under '$STATIC_DIR/' or change STATIC_DIR in the cron file."
  exit 1
fi

release_id="$(date -u '+%Y%m%dT%H%M%SZ')-${remote_sha:0:12}"
release_dir="$RELEASES_DIR/$release_id"
mkdir -p "$release_dir"

cleanup_failed_release() {
  status=$?
  if (( status != 0 )); then
    log "Deployment failed; keeping the current site unchanged."
    [[ -n "${release_dir:-}" && -d "${release_dir:-}" ]] && rm -rf -- "$release_dir"
  fi
  exit "$status"
}
trap cleanup_failed_release EXIT

# Export committed files only. This excludes .git, untracked files, and server edits.
git_repo archive "$remote_sha" "$STATIC_DIR" | tar -x -C "$release_dir"
published_dir="$release_dir/$STATIC_DIR"
[[ -f "$published_dir/index.html" ]] || { log "ERROR: exported site is incomplete"; exit 1; }

# Apply the persistent SELinux rule configured during installation.
if command -v restorecon >/dev/null 2>&1; then
  restorecon -RF "$release_dir"
fi

# Switch only after all validation succeeds. mv -T is atomic on the same filesystem.
next_link="${CURRENT_LINK}.next"
rm -f -- "$next_link"
ln -s "$published_dir" "$next_link"
mv -Tf "$next_link" "$CURRENT_LINK"
printf '%s\n' "$remote_sha" > "$APP_ROOT/DEPLOYED_SHA"

active_target="$(readlink -f "$CURRENT_LINK")"
mapfile -t old_releases < <(
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -nr \
    | awk -v keep="$KEEP_RELEASES" 'NR > keep {sub(/^[^ ]+ /, ""); print}'
)
for old_release in "${old_releases[@]:-}"; do
  [[ -n "$old_release" ]] || continue
  if [[ "$active_target" == "$old_release" || "$active_target" == "$old_release"/* ]]; then
    continue
  fi
  rm -rf -- "$old_release"
done

trap - EXIT
log "Deployment complete: ${remote_sha:0:12} -> $published_dir"
