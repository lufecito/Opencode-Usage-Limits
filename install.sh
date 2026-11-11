#!/bin/sh
# Install the usage-limits plugin without administrator privileges.
#
# The plugin lives entirely in your home directory. It is copied into
# OpenCode's global plugin discovery directory, so no configuration entry,
# no npm install, and no root access are required.

set -eu

NAME="opencode-usage-limits"
REPO_URL="https://github.com/lufecito/Opencode-Usage-Limits.git"

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
PLUGINS_DIR="$CONFIG_DIR/plugins"
TARGET="$PLUGINS_DIR/$NAME"
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

say() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
  say "usage: install.sh [--uninstall]"
  say ""
  say "Installs the plugin into $TARGET."
  say "Set XDG_CONFIG_HOME to change the OpenCode config directory."
}

uninstall() {
  if [ ! -d "$TARGET" ]; then
    say "Plugin is not installed at $TARGET."
    exit 0
  fi
  rm -r "$TARGET"
  say "Removed $TARGET."
  say "Restart the OpenCode service to unload the plugin: opencode service restart"
}

case "${1:-}" in
  --uninstall) uninstall; exit 0 ;;
  -h|--help) usage; exit 0 ;;
  "") ;;
  *) usage >&2; exit 2 ;;
esac

command -v git >/dev/null 2>&1 || die "git is required to install from the repository."

mkdir -p "$PLUGINS_DIR"

if [ "$SOURCE_DIR" = "$TARGET" ]; then
  say "Plugin already lives at $TARGET."
  exit 0
fi

if [ ! -f "$SOURCE_DIR/package.json" ]; then
  die "run install.sh from a checkout of $REPO_URL."
fi

if [ -d "$TARGET/.git" ]; then
  say "Updating the existing git checkout at $TARGET."
  git -C "$TARGET" pull --ff-only || warn "could not update $TARGET; keeping the current copy."
else
  if [ -d "$TARGET" ]; then
    warn "replacing the existing copy at $TARGET."
    rm -r "$TARGET"
  fi
  mkdir -p "$TARGET"
  cp "$SOURCE_DIR/package.json" "$TARGET/package.json"
  if [ -f "$SOURCE_DIR/README.md" ]; then
    cp "$SOURCE_DIR/README.md" "$TARGET/README.md"
  fi
  cp -R "$SOURCE_DIR/src" "$TARGET/src"
  say "Copied the plugin to $TARGET."
fi

if [ -f "$CONFIG_DIR/opencode.json" ] && grep -q "Opencode-Usage-Limits" "$CONFIG_DIR/opencode.json"; then
  warn "opencode.json still lists the repository path in its plugins array."
  warn "Remove that entry so OpenCode loads the plugin once instead of twice."
fi

say ""
say "Done. The plugin loads automatically from the global plugins directory."
say "Verify with: opencode api get /api/plugin"
say "If it does not appear, run: opencode service restart"
