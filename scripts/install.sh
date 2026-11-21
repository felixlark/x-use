#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMMIT=$(git -C "$ROOT" rev-parse --short=12 HEAD)
case "$(uname -s)" in
  Darwin)
    DEFAULT_TARGET="$HOME/Library/Application Support/x-use"
    ;;
  *)
    DEFAULT_TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/x-use"
    ;;
esac
TARGET="${X_USE_INSTALL_ROOT:-$DEFAULT_TARGET}"
RELEASE="$TARGET/releases/$COMMIT"
STAGE="$TARGET/releases/.stage-$COMMIT-$$"
SKILLS="${X_USE_SKILLS_ROOT:-$HOME/.agents/skills}"
SKILL_LINK="$SKILLS/x-use"

mkdir -p "$TARGET/releases" "$SKILLS"

if [ ! -d "$RELEASE" ]; then
  mkdir -p "$STAGE"
  cp -R \
    "$ROOT/package.json" \
    "$ROOT/package-lock.json" \
    "$ROOT/LICENSE" \
    "$ROOT/bin" \
    "$ROOT/src" \
    "$ROOT/scripts" \
    "$ROOT/skills" \
    "$ROOT/docs" \
    "$ROOT/README.md" \
    "$ROOT/AGENTS.md" \
    "$STAGE/"
  (
    cd "$STAGE"
    npm ci --omit=dev --ignore-scripts
  )
  chmod +x "$STAGE/bin/x-use-mcp.js"
  mv "$STAGE" "$RELEASE"
fi

ln -sfn "$RELEASE" "$TARGET/current"

if [ -e "$SKILL_LINK" ] && [ ! -L "$SKILL_LINK" ]; then
  printf 'Refusing to overwrite non-symlink Skill at %s\n' "$SKILL_LINK" >&2
  exit 2
fi
ln -sfn "$TARGET/current/skills/x-use" "$SKILL_LINK"

printf 'Installed X Use %s\n' "$COMMIT"
printf 'MCP: %s\n' "$TARGET/current/bin/x-use-mcp.js"
printf 'Skill: %s -> %s\n' "$SKILL_LINK" "$TARGET/current/skills/x-use"

