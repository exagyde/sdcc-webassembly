#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Nolann Morencé (exagyde)
# Part of sdcc-webassembly, the in-browser compiler engine of CAPSIMO.
#
# Builds SDCC and the GBDK-2020 tools to WebAssembly into dist/.
# Sources are fetched into vendor/src unless already there (for example after
# extracting a release's source archive, which needs no SVN or Git access).
#
# Environment: JOBS (parallel jobs), BOOST_INCLUDE (Boost headers),
# EMSDK_DIR (an existing emsdk checkout, default vendor/emsdk).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/vendor/src"
EMSDK="${EMSDK_DIR:-$ROOT/vendor/emsdk}"
DIST="$ROOT/dist"
OUT="$DIST/toolchain"
EMSDK_VERSION="6.0.11"
SDCC_REV="15267"
GBDK_TAG="4.5.0"
PATCHES_COMMIT="11d1f650459df85f1011106a7ce65e08222b413f"
PATCHES_BRANCH="sdcc_4.5.0__backport_patches"
APPLE_LIBC_COMMIT="71bbe350ab79"
JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc)}"

PATCHED="$SRC/sdcc-$SDCC_REV-${PATCHES_COMMIT:0:7}"
GBDK_PATCHES="$SRC/gbdk-2020-sdcc-${PATCHES_COMMIT:0:7}"
GBDK="$SRC/gbdk-2020-$GBDK_TAG"
APPLE="$SRC/apple-libc-$APPLE_LIBC_COMMIT"

# Sources: SDCC r15267 with the GBDK-2020 patch series, GBDK-2020 4.5.0, Apple's qsort.
mkdir -p "$SRC"
if [ ! -d "$GBDK_PATCHES" ]; then
  rm -rf "$GBDK_PATCHES.tmp"
  git clone -q --branch "$PATCHES_BRANCH" https://github.com/gbdk-2020/gbdk-2020-sdcc.git "$GBDK_PATCHES.tmp/repo"
  git -C "$GBDK_PATCHES.tmp/repo" archive "$PATCHES_COMMIT" Patches | tar -x -C "$GBDK_PATCHES.tmp"
  rm -rf "$GBDK_PATCHES.tmp/repo"
  mv "$GBDK_PATCHES.tmp" "$GBDK_PATCHES"
fi
if [ ! -d "$PATCHED" ]; then
  rm -rf "$PATCHED.tmp"
  svn checkout -q -r "$SDCC_REV" svn://svn.code.sf.net/p/sdcc/code/trunk/sdcc "$PATCHED.tmp/sdcc"
  for patch in "$GBDK_PATCHES"/Patches/*.patch; do
    (cd "$PATCHED.tmp" && patch -p0 -f -s < "$patch")
  done
  mv "$PATCHED.tmp" "$PATCHED"
fi
if [ ! -d "$GBDK" ]; then
  rm -rf "$GBDK.tmp"
  git -c advice.detachedHead=false clone -q --depth 1 --branch "$GBDK_TAG" https://github.com/gbdk-2020/gbdk-2020.git "$GBDK.tmp"
  mv "$GBDK.tmp" "$GBDK"
fi
if [ ! -d "$APPLE" ]; then
  mkdir -p "$APPLE.tmp"
  for file in qsort heapsort; do
    curl -sfL "https://raw.githubusercontent.com/apple-oss-distributions/Libc/$APPLE_LIBC_COMMIT/stdlib/FreeBSD/$file.c" -o "$APPLE.tmp/$file.c"
  done
  mv "$APPLE.tmp" "$APPLE"
fi

# Emscripten
if [ ! -d "$EMSDK" ]; then
  git clone -q --depth 1 https://github.com/emscripten-core/emsdk.git "$EMSDK"
fi
(cd "$EMSDK" && ./emsdk install "$EMSDK_VERSION" >/dev/null && ./emsdk activate "$EMSDK_VERSION" >/dev/null)
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
if command -v brew >/dev/null; then
  export PATH="$(brew --prefix bison)/bin:$PATH"
  BOOST_INCLUDE="${BOOST_INCLUDE:-$(brew --prefix boost)/include}"
fi
BOOST_INCLUDE="${BOOST_INCLUDE:-/usr/include}"

BUILD="$SRC/build/sdcc"
EMFLAGS="-O2 -fwasm-exceptions -sUSE_ZLIB=1"
LINK_FLAGS="$EMFLAGS -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=8388608 -sEXIT_RUNTIME=1 -sINVOKE_RUN=0 -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain -g0"

# SDCC: configure and build once per set of local patches, then relink the tools.
LOCAL_PATCHES="$ROOT/patches"
PATCH_STAMP="${PATCHES_COMMIT:0:7}-$(cat "$LOCAL_PATCHES"/*.patch | shasum | cut -c1-12)"
if [ ! -f "$BUILD/.patches-$PATCH_STAMP" ]; then
  rm -rf "$SRC/build" && mkdir -p "$SRC/build" && cp -R "$PATCHED/sdcc" "$BUILD"
  for patch in "$LOCAL_PATCHES"/*.patch; do
    (cd "$SRC/build" && patch -p0 -f -s < "$patch")
  done
  (cd "$BUILD" && emconfigure ./configure --disable-shared \
    --enable-gbz80-port --enable-z80-port --disable-mos6502-port --disable-mos65c02-port \
    --disable-r800-port --disable-mcs51-port --disable-z180-port --disable-r2k-port --disable-r2ka-port \
    --disable-r3ka-port --disable-tlcs90-port --disable-ez80_z80-port --disable-z80n-port --disable-ds390-port \
    --disable-ds400-port --disable-pic14-port --disable-pic16-port --disable-hc08-port --disable-s08-port \
    --disable-stm8-port --disable-pdk13-port --disable-pdk14-port --disable-pdk15-port --disable-f8-port \
    --disable-ucsim --disable-doc --disable-device-lib --disable-packihx --disable-sdcpp --disable-sdcdb \
    --disable-sdbinutils --disable-non-free \
    CPPFLAGS="-I$BOOST_INCLUDE -sUSE_ZLIB=1" CFLAGS="$EMFLAGS" CXXFLAGS="$EMFLAGS" LDFLAGS="$EMFLAGS" > "$SRC/build/configure.log" 2>&1)
  (cd "$BUILD" && emmake make -j"$JOBS" > "$SRC/build/make.log" 2>&1)
  touch "$BUILD/.patches-$PATCH_STAMP"
fi

LIBIBERTY="$BUILD/support/sdbinutils/libiberty"
if [ ! -f "$LIBIBERTY/libiberty.a" ]; then
  (cd "$LIBIBERTY" && ac_cv_func_psignal=yes emconfigure ./configure --disable-shared CFLAGS="$EMFLAGS" > "$SRC/build/libiberty.log" 2>&1 && emmake make -j"$JOBS" >> "$SRC/build/libiberty.log" 2>&1)
fi

CPP="$BUILD/support/cpp"
if [ ! -f "$CPP/gcc/c/c-lang.o" ]; then
  (cd "$CPP" && emconfigure ./configure --disable-option-checking --disable-shared --disable-nls --target=i686-pc-linux-gnu \
    CPPFLAGS="-sUSE_ZLIB=1" CFLAGS="$EMFLAGS" CXXFLAGS="$EMFLAGS" LDFLAGS="$EMFLAGS" > "$SRC/build/configure-cpp.log" 2>&1)
  (cd "$CPP" && emmake make -j"$JOBS" > "$SRC/build/make-cpp.log" 2>&1)
fi

rm -f "$BUILD/src/sdcc" "$BUILD/src/sdcc.wasm" "$BUILD"/bin/sdasgb* "$BUILD"/bin/sdld* "$CPP/gcc/cc1" "$CPP/gcc/cc1.wasm"
(cd "$BUILD/src" && emmake make -j"$JOBS" LDFLAGS="$LINK_FLAGS" > "$SRC/build/link-sdcc.log" 2>&1)
(cd "$BUILD/sdas/asgb" && emmake make -j"$JOBS" LDFLAGS="$LINK_FLAGS" > "$SRC/build/link-asgb.log" 2>&1)
(cd "$BUILD/sdas/linksrc" && emmake make -j"$JOBS" all LDFLAGS="$LINK_FLAGS" > "$SRC/build/link-sdld.log" 2>&1)
(cd "$CPP/gcc" && emmake make cc1 LDFLAGS="$LINK_FLAGS" > "$SRC/build/link-cc1.log" 2>&1)

rm -rf "$DIST" && mkdir -p "$OUT"
cp "$BUILD/src/sdcc" "$OUT/sdcc.mjs" && cp "$BUILD/src/sdcc.wasm" "$OUT/"
cp "$BUILD/bin/sdasgb" "$OUT/sdasgb.mjs" && cp "$BUILD/bin/sdasgb.wasm" "$OUT/"
cp "$BUILD/bin/sdld" "$OUT/sdld.mjs" && cp "$BUILD/bin/sdld.wasm" "$OUT/"
cp "$CPP/gcc/cc1" "$OUT/cc1.mjs" && cp "$CPP/gcc/cc1.wasm" "$OUT/"

# GBDK-2020 tools. bankpack is linked with Apple's qsort to assign banks as on macOS.
GBDK_SUPPORT="$GBDK/gbdk-support"
emcc $LINK_FLAGS -w -I"$ROOT/shims" -o "$OUT/bankpack.mjs" "$GBDK_SUPPORT/bankpack"/*.c "$APPLE/qsort.c" "$APPLE/heapsort.c"
for tool in ihxcheck makebin; do
  emcc $LINK_FLAGS -w -o "$OUT/$tool.mjs" "$GBDK_SUPPORT/$tool"/*.c
done

# Runtime modules, licenses and checksums ship with the binaries.
cp "$ROOT"/src/*.mjs "$DIST/"
cp -R "$ROOT/LICENSE" "$ROOT/NOTICE.md" "$ROOT/licenses" "$DIST/"
(cd "$DIST" && find . -type f ! -name SHA256SUMS | sed 's|^\./||' | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS)
cat "$DIST/SHA256SUMS"
