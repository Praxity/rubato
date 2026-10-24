#!/bin/sh
# Run from a reviewed checkout. No system Node, sudo or shell-profile edits.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT="$HOME/.praxity/toolkit"
BIN="$HOME/.praxity/bin"
ACTION=install
MANIFEST=
MANIFEST_DIGEST=
PLATFORM=
die() { printf '%s\n' "$*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    install|rollback|uninstall) ACTION=$1; shift ;;
    --manifest) [ "$#" -ge 2 ] || die 'Missing --manifest value'; MANIFEST=$2; shift 2 ;;
    --manifest-sha256) [ "$#" -ge 2 ] || die 'Missing --manifest-sha256 value'; MANIFEST_DIGEST=$2; shift 2 ;;
    --platform) [ "$#" -ge 2 ] || die 'Missing --platform value'; PLATFORM=$2; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done
case "$HOME" in /*) ;; *) die 'HOME must be an absolute path' ;; esac
case "$HOME" in *'
'*) die 'HOME must not contain newlines' ;; esac
# Resolve HOME once, then refuse symlinks in every descendant ancestor.
INSTALL_HOME=$(CDPATH= cd -P -- "$HOME" && pwd -P) || die 'Cannot resolve HOME'
ROOT="$INSTALL_HOME/.praxity/toolkit"
BIN="$INSTALL_HOME/.praxity/bin"
. "$SCRIPT_DIR/scripts/install-paths.sh"
contained "$ROOT"
contained "$BIN/praxity"
if [ "$ACTION" = uninstall ]; then
  rm -rf "$ROOT"
  rm -f "$BIN/praxity"
  printf '%s\n' 'Rubato removed. Host skills and optional tool components remain installed.'
  exit 0
fi
command -v shasum >/dev/null 2>&1 || die 'Install needs shasum -a 256'
mkdir -p "$ROOT"
rm -rf "$ROOT"/.install.*
WORK=$(mktemp -d "$ROOT/.install.XXXXXX")
LAUNCHER_TEMP=
cleanup() {
  STATUS=$?
  trap - EXIT
  [ -z "$LAUNCHER_TEMP" ] || rm -f "$LAUNCHER_TEMP"
  rm -rf "$WORK"
  if [ "$STATUS" -ne 0 ]; then printf '%s\n' 'Install did not finish. Resolve the error and rerun install; rerunning also repairs an interrupted install.' >&2; fi
  exit "$STATUS"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
new_temp() { mktemp "$WORK/item.XXXXXX"; }
capture() { OUTPUT=$1; shift; "$@" > "$OUTPUT"; }
sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
fetch() (
  OUTPUT=$1; URL=$2
  cd -- "${OUTPUT%/*}"
  curl --fail --location --proto '=https,file' --proto-redir '=https' --connect-timeout 15 --max-time 300 --retry 2 --output "${OUTPUT##*/}" "$URL"
)
safe_version() {
  printf '%s\n' "$1" | LC_ALL=C awk 'BEGIN {ok=0} /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$/ {ok=1} END {exit !ok}' || die 'Invalid pack version'
}
activate() {
  safe_version "$1"
  [ -z "$2" ] || safe_version "$2"
  contained "$ROOT/active"
  if [ -f "$ROOT/active" ]; then cp "$ROOT/active" "$WORK/previous"; fi
  POINTER=$(new_temp)
  printf '%s\n%s\n' "$1" "$2" > "$POINTER"
  mv "$POINTER" "$ROOT/active"
  if ! "$BIN/praxity" --version || ! "$BIN/praxity" doctor; then
    if [ -f "$WORK/previous" ]; then mv "$WORK/previous" "$ROOT/active";
    else rm -f "$ROOT/active" "$BIN/praxity"; fi
    die 'Activation version or doctor failed; restored the previous active pack. Resolve the error and rerun install.'
  fi
}
if [ "$ACTION" = rollback ]; then
  CURRENT=$(sed -n '1p' "$ROOT/active") || die 'No current pack'
  PREVIOUS=$(sed -n '2p' "$ROOT/active") || die 'No previous pack to roll back to'
  [ -n "$PREVIOUS" ] || die 'No previous pack to roll back to'
  safe_version "$CURRENT"; safe_version "$PREVIOUS"
  contained "$ROOT/$PREVIOUS"
  NODE="$ROOT/$PREVIOUS/runtimes/node/bin/node"
  "$NODE" "$SCRIPT_DIR/src/install.mjs" verify "$ROOT/$PREVIOUS/pack.json" darwin-arm64 "$ROOT/$PREVIOUS"
  activate "$PREVIOUS" "$CURRENT"
  printf 'Active pack: %s\n' "$PREVIOUS"
  exit 0
fi
command -v curl >/dev/null 2>&1 || die 'Install needs curl'
command -v tar >/dev/null 2>&1 || die 'Install needs tar'
command -v mktemp >/dev/null 2>&1 || die 'Install needs mktemp'
if [ -z "$PLATFORM" ]; then
  OS=$(uname -s); CPU=$(uname -m)
  case "$OS:$CPU" in
    Darwin:arm64) PLATFORM=darwin-arm64 ;;
    Darwin:x86_64)
      # A translated shell reports x86_64 on Apple Silicon. Use native runtimes.
      if [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then PLATFORM=darwin-arm64;
      else PLATFORM=darwin-x64; fi ;;
    *) die "Unsupported platform: $OS $CPU. Only Apple Silicon and Intel macOS are implemented." ;;
  esac
fi
case "$PLATFORM" in darwin-arm64|darwin-x64) ;; *) die "Platform not implemented: $PLATFORM" ;; esac
MANIFEST_FILE=$(new_temp)
BOOTSTRAP_TSV=$(new_temp)
if [ -z "$MANIFEST" ]; then capture "$MANIFEST_FILE" cat "$SCRIPT_DIR/pack.json";
else
  case "$MANIFEST" in https://*|file:///*) ;; *) die 'Manifest must use https:// or file:///' ;; esac
  fetch "$MANIFEST_FILE" "$MANIFEST" || die 'Manifest download failed; rerun the same command after resolving it'
fi
if [ -n "$MANIFEST_DIGEST" ]; then
  [ "${#MANIFEST_DIGEST}" = 64 ] || die 'Invalid reviewed manifest digest'
  case "$MANIFEST_DIGEST" in *[!a-f0-9]*) die 'Invalid reviewed manifest digest' ;; esac
else
  case "$MANIFEST" in https://*) MANIFEST_DIGEST=$(sha256 "$SCRIPT_DIR/pack.json") ;; esac
fi
if [ -n "$MANIFEST_DIGEST" ]; then
  [ "$(sha256 "$MANIFEST_FILE")" = "$MANIFEST_DIGEST" ] || die 'Manifest SHA-256 mismatch. Supply the reviewed digest with --manifest-sha256 before selecting Node.'
fi
capture "$BOOTSTRAP_TSV" awk -f "$SCRIPT_DIR/scripts/bootstrap-json.awk" "$MANIFEST_FILE"
get() { awk -F '\t' -v key="$1" '$1 == key {print $2}' "$BOOTSTRAP_TSV"; }
VERSION=$(get /version)
safe_version "$VERSION"
NODE_URL=$(get "/runtimes/node/archives/$PLATFORM/url")
NODE_SHA=$(get "/runtimes/node/archives/$PLATFORM/sha256")
NODE_FORMAT=$(get "/runtimes/node/archives/$PLATFORM/format")
NODE_STRIP=$(get "/runtimes/node/archives/$PLATFORM/stripComponents")
NODE_ENTRY=$(get "/runtimes/node/entry/$PLATFORM")
case "$NODE_ENTRY" in bin/node) ;; *) die 'Unsupported bootstrap Node entry' ;; esac
[ "$NODE_STRIP" = 0 ] || [ "$NODE_STRIP" = 1 ] || die 'Invalid bootstrap stripComponents'
case "$NODE_FORMAT" in tar.gz|tar.xz) ;; *) die 'Unsupported bootstrap Node archive' ;; esac
download() (
  URL=$1; HASH=$2; FORMAT=$3
  case "$URL" in https://*|file:///*) ;; *) die 'Artifact URL must use https:// or file:///' ;; esac
  [ "${#HASH}" = 64 ] || die 'Invalid SHA-256'
  case "$HASH" in *[!a-f0-9]*) die 'Invalid SHA-256' ;; esac
  contained "$ROOT/.cache"
  FILE="$HASH.$FORMAT"
  if [ -f "$ROOT/.cache/$FILE" ]; then
    contained "$ROOT/.cache/$FILE"
    [ "$(sha256 "$ROOT/.cache/$FILE")" = "$HASH" ] || die "Cached checksum mismatch: $FILE. Remove the damaged cache file and rerun."
    exit 0
  fi
  mkdir -p "$ROOT/.cache"
  cd "$ROOT/.cache"
  printf 'Download: %s\n' "$URL"
  PARTIAL=$(new_temp)
  # Release bootstraps can bundle archives under their content hash.
  if [ -f "$SCRIPT_DIR/archives/$FILE" ]; then
    capture "$PARTIAL" cat "$SCRIPT_DIR/archives/$FILE" || die 'Bundled archive read failed; rerun the same install command'
  else
    fetch "$PARTIAL" "$URL" "$HASH" || die 'Download interrupted or failed; rerun the same install command'
  fi
  [ "$(sha256 "$PARTIAL")" = "$HASH" ] || { rm -f "$PARTIAL"; die "Checksum mismatch: $URL. Nothing activated."; }
  mv "$PARTIAL" "$ROOT/.cache/$FILE"
)
extract() (
  ARCHIVE=$1; DIRECTORY=$2; STRIP=$3
  contained "$DIRECTORY"
  [ ! -L "$DIRECTORY" ] || die 'Staging destination is a symlink'
  ARCHIVE_LIST=$(new_temp)
  ARCHIVE_LINKS=$(new_temp)
  capture "$ARCHIVE_LIST" tar -P -tf "$ARCHIVE"
  LC_ALL=C awk '
    /^\// || /(^|\/)\.\.(\/|$)/ || /\\/ || /^[A-Za-z]:/ {exit 1}
  ' "$ARCHIVE_LIST" || die 'Unsafe archive path'
  capture "$ARCHIVE_LINKS" tar -P -tvf "$ARCHIVE"
  LC_ALL=C awk -v strip="$STRIP" -f "$SCRIPT_DIR/scripts/archive-links.awk" "$ARCHIVE_LINKS" || die 'Unsafe archive link or special file'
  mkdir -p "$DIRECTORY"
  tar -xf "$ARCHIVE" -C "$DIRECTORY" --strip-components="$STRIP"
  rm -f "$ARCHIVE_LIST" "$ARCHIVE_LINKS"
)
download "$NODE_URL" "$NODE_SHA" "$NODE_FORMAT"
BOOTSTRAP="$WORK/bootstrap"
extract "$ROOT/.cache/$NODE_SHA.$NODE_FORMAT" "$BOOTSTRAP" "$NODE_STRIP"
NODE="$BOOTSTRAP/$NODE_ENTRY"
[ "$("$NODE" --version)" = "v$(get /runtimes/node/version)" ] || die 'Downloaded Node does not match its declared version'
PLAN=$(new_temp)
capture "$PLAN" "$NODE" "$SCRIPT_DIR/src/install.mjs" plan "$MANIFEST_FILE" "$PLATFORM"
contained "$ROOT/$VERSION"
if [ -e "$ROOT/$VERSION" ]; then
  "$NODE" "$SCRIPT_DIR/src/install.mjs" verify "$MANIFEST_FILE" "$PLATFORM" "$ROOT/$VERSION"
else
  STAGE="$WORK/stage"
  mkdir "$STAGE"
  TAB=$(printf '\t')
  # Check every download before publishing a version or launcher.
  while IFS="$TAB" read -r KIND ID URL HASH FORMAT STRIP ENTRY; do download "$URL" "$HASH" "$FORMAT"; done < "$PLAN"
  while IFS="$TAB" read -r KIND ID URL HASH FORMAT STRIP ENTRY; do
    case "$KIND" in runtime) CATEGORY=runtimes ;; tool) CATEGORY=tools ;; *) die 'Invalid install plan' ;; esac
    extract "$ROOT/.cache/$HASH.$FORMAT" "$STAGE/$CATEGORY/$ID" "$STRIP"
  done < "$PLAN"
  for DIRECTORY in src scripts schemas skills fixtures; do cp -R "$SCRIPT_DIR/$DIRECTORY" "$STAGE/$DIRECTORY"; done
  for FILE in install.sh package.json; do cp "$SCRIPT_DIR/$FILE" "$STAGE/$FILE"; done
  cp "$MANIFEST_FILE" "$STAGE/pack.json"
  "$NODE" "$SCRIPT_DIR/src/install.mjs" finalize "$STAGE/pack.json" "$PLATFORM" "$STAGE" "$ROOT"
  if [ -e "$ROOT/$VERSION" ]; then
    rm -rf "$STAGE"
    "$NODE" "$SCRIPT_DIR/src/install.mjs" verify "$MANIFEST_FILE" "$PLATFORM" "$ROOT/$VERSION"
  else
    mv "$STAGE" "$ROOT/$VERSION"
  fi
fi
mkdir -p "$BIN"
LAUNCHER_TEMP=$(mktemp "$BIN/.praxity-launcher.XXXXXX")
cp "$ROOT/$VERSION/launcher.sh" "$LAUNCHER_TEMP"
chmod +x "$LAUNCHER_TEMP"
mv "$LAUNCHER_TEMP" "$BIN/praxity"
LAUNCHER_TEMP=
CURRENT=$(sed -n '1p' "$ROOT/active" 2>/dev/null || true)
PREVIOUS=$(sed -n '2p' "$ROOT/active" 2>/dev/null || true)
if [ -n "$CURRENT" ] && [ "$CURRENT" != "$VERSION" ]; then PREVIOUS=$CURRENT; fi
activate "$VERSION" "$PREVIOUS"
REFRESH_CODE=0
"$BIN/praxity" skills refresh --scope user || {
  printf '%s\n' 'Host skills were not refreshed; the pack is active. Resolve the error, then run praxity skills refresh --scope user.' >&2
  REFRESH_CODE=1
}
printf 'Installed pack %s. Add this line to PATH yourself:\n' "$VERSION"
printf 'export PATH="$HOME/.praxity/bin:$PATH"\n'
printf '%s\n' 'Close Studio before rollback or uninstall. Optional components require praxity setup consent.'
exit "$REFRESH_CODE"
