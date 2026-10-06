#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Nolann Morencé (exagyde)
# Part of sdcc-webassembly, the in-browser compiler engine of CAPSIMO.
#
# Packs the files of a GitHub release into release/:
#   sdcc-webassembly-<version>.zip            dist/: binaries, runtime modules, licenses
#   sdcc-webassembly-<version>-source.tar.xz  Corresponding Source: this repository and the
#                                             third-party sources in vendor/src, ready to build
#                                             with ./build.sh without SVN or Git access
# Run ./build.sh first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$ROOT/package.json")"
NAME="sdcc-webassembly-$VERSION"
OUT="$ROOT/release"

if [ ! -f "$ROOT/dist/SHA256SUMS" ] || [ ! -d "$ROOT/vendor/src" ]; then
  echo "dist/ or vendor/src/ is missing: run ./build.sh first" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
export COPYFILE_DISABLE=1

# Binaries
mkdir -p "$STAGE/bin"
cp -R "$ROOT/dist" "$STAGE/bin/$NAME"

# Sources. SDCC's device/non-free (not free software, unused with --disable-non-free),
# GBDK's documentation and version control data are left out.
mkdir -p "$STAGE/src/$NAME"
rsync -a --exclude /.git --exclude /vendor --exclude /dist --exclude /release --exclude node_modules --exclude .DS_Store \
  "$ROOT/" "$STAGE/src/$NAME/"
mkdir -p "$STAGE/src/$NAME/vendor/src"
rsync -a --exclude /build --exclude '/*.tmp' --exclude .svn --exclude .git --exclude .DS_Store \
  --exclude '/sdcc-*/sdcc/device/non-free' --exclude '/gbdk-2020-*/docs' \
  "$ROOT/vendor/src/" "$STAGE/src/$NAME/vendor/src/"

mkdir -p "$OUT"
rm -f "$OUT/$NAME.zip" "$OUT/$NAME-source.tar.xz"
(cd "$STAGE/bin" && zip -qrX "$OUT/$NAME.zip" "$NAME")
(cd "$STAGE/src" && tar -cJf "$OUT/$NAME-source.tar.xz" "$NAME")
(cd "$OUT" && ls -lh "$NAME.zip" "$NAME-source.tar.xz" && shasum -a 256 "$NAME.zip" "$NAME-source.tar.xz")
