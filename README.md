# sdcc-webassembly

SDCC and the GBDK-2020 tools compiled to WebAssembly: compile C into Game Boy ROMs in a browser, a web worker or Node.js, with no server and no native binaries.

This is the compiler engine of **CAPSIMO**, an AI-assisted Game Boy game studio that runs entirely in the browser, created by Nolann Morencé ([@exagyde](https://github.com/exagyde)). It is published so that the source code, patches and build scripts of the binaries CAPSIMO ships are available to everyone, as the GNU GPL requires, and so that other projects can use them.

## Contents

| Tool | Built from | Role |
| --- | --- | --- |
| `cc1` | SDCC's preprocessor (sdcpp, derived from GCC) | C preprocessor |
| `sdcc` | SDCC 4.5.1 #15267 with the GBDK-2020 4.5.0 patches | C → SM83 assembly |
| `sdasgb` | SDCC's assembler (ASxxxx) | Assembly → object file |
| `sdld` | SDCC's linker, run as `sdldgb` | Object files → Intel HEX |
| `bankpack` | GBDK-2020 4.5.0 | Automatic ROM bank assignment |
| `ihxcheck` | GBDK-2020 4.5.0 | Bank overflow check |
| `makebin` | GBDK-2020 4.5.0 | Intel HEX → `.gb` ROM |

Two ES modules drive them:

- `toolchain.mjs` runs a tool like a command line program: input files come from a `Map`, the files it writes are added to it.
- `lcc.mjs` replaces GBDK-2020's `lcc` driver, which starts processes and cannot run in WebAssembly. Game Boy target only.

A release unpacks to:

```
sdcc-webassembly-1.0.0/
  toolchain.mjs, lcc.mjs
  toolchain/              cc1, sdcc, sdasgb, sdld, bankpack, ihxcheck, makebin (.mjs loader + .wasm)
  LICENSE, NOTICE.md, licenses/, SHA256SUMS
```

The GBDK-2020 headers and libraries are not included: take `include/` and `lib/` from the [GBDK-2020 4.5.0 release](https://github.com/gbdk-2020/gbdk-2020/releases/tag/4.5.0).

## Usage

```js
import { lcc } from "./sdcc-webassembly-1.0.0/lcc.mjs";

// Virtual file system: absolute path → Uint8Array.
// GBDK-2020 4.5.0's include/, lib/gb/ and lib/sm83/ go under /gbdk.
const vfs = new Map();
vfs.set("/work/hello.c", new TextEncoder().encode(source));

const ctx = { vfs, cwd: "/work", gbdk: "/gbdk" };
await lcc(["-c", "-o", "hello.o", "hello.c"], ctx);
await lcc(["-o", "hello.gb", "hello.o"], ctx);
const rom = vfs.get("/work/hello.gb");
```

[`test/hello.mjs`](test/hello.mjs) is a complete Node.js example.

In a browser, call the tools from a web worker: each call blocks its thread while it runs. `preload()` downloads and compiles every tool ahead of time; `preload(version)` appends `?v=<version>` to their URLs so that a new deployment never reuses stale cached files. Any static server works as long as it serves `.mjs` files as JavaScript: `.wasm` files need no specific MIME type, and no cross-origin isolation is required. CAPSIMO runs one worker per core and compiles the files of a game in parallel.

### `lcc(args, ctx)`

| Option | Meaning |
| --- | --- |
| `-c`, `-o <file>` | Compile or assemble only; output file |
| `-I<dir>`, `-D<macro>` | Include directory, macro definition |
| `-Wf<opt>`, `-Wa<opt>`, `-Wl<opt>`, `-Wb<opt>`, `-Wi<opt>`, `-Wm<opt>` | Option passed to sdcc, sdasgb, sdldgb, bankpack, ihxcheck or makebin |
| `-autobank` | Assign ROM banks with bankpack |

`-m…` options are ignored: the target is always the Game Boy. Object files to link are listed on the command line or in a link file (`-Wl-f<file>`). As with GBDK-2020's `lcc`, the linker gets `.STACK=0xE000`, `_shadow_OAM=0xC000`, `_DATA=0xC0A0`, `_CODE=0x0200` and `_HRAM=0xFF80` unless `-Wl-g` or `-Wl-b` sets them.

`ctx.vfs` is the file system and `ctx.cwd` the working directory. `ctx.gbdk` is the GBDK-2020 directory inside `vfs`. `ctx.cache` is optional: an object with `get(key)` and `set(key, value)`, possibly asynchronous, that keeps compiled object files. Its keys are SHA-256 hashes of the preprocessed source and sdcc options. CAPSIMO stores them in IndexedDB.

A failed step throws an `Error` whose `log` property holds the tool's output.

### `runTool(name, args, options)`

Runs one tool of `toolchain.mjs` and resolves to `{ code, stdout, stderr }`. Options: `vfs`, `cwd`, `stdin` (`Uint8Array`), `program` (argv[0]) and `roots` (directories whose new or changed files are copied back into `vfs`).

## Building

Requirements: macOS or Linux, bash, Git, Subversion, curl, patch, a C and C++ compiler, bison, the Boost headers and Python 3. With Homebrew: `brew install subversion boost bison`.

```bash
./build.sh                               # → dist/
GBDK_HOME=/path/to/gbdk npm test         # add -- --native to compare with GBDK's native lcc
npm run release                          # → release/
```

`build.sh` downloads into `vendor/`: Emscripten 6.0.11, SDCC r15267 (SourceForge SVN), the GBDK-2020 patch series (`gbdk-2020-sdcc`, commit `11d1f65`), GBDK-2020 4.5.0 and Apple Libc's `qsort.c` and `heapsort.c`. The build then takes a few minutes. Sources already present in `vendor/src` are reused, so building from a release's source archive needs neither Subversion nor Git.

Environment variables: `JOBS` (parallel jobs), `BOOST_INCLUDE` (Boost headers), `EMSDK_DIR` (an existing emsdk checkout). On a Mac whose Command Line Tools have incomplete C++ headers: `CXX="clang++ -nostdinc++ -isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1"`.

## Patches

- **GBDK-2020 patch series**: the patches GBDK-2020 applies to its own SDCC. Patch 5000 backports SDCC's fix for bug #3870; without it, sdcc generates wrong code for GB Studio's `music_manager.c`.
- **`patches/9000_iterative_tree_decomposition.patch`**: in a browser, every WebAssembly call runs on the worker's native stack, limited to a few hundred KB (Safari reported "Maximum call stack size exceeded"). The patch makes the recursive walks of SDCC's register allocator and optimizations iterative, without changing the generated code: compilation fits in 100 KB of stack.
- **bankpack with Apple's `qsort`**: bankpack's sort does not break ties between areas of the same size, so the bank layout depends on the C library. Linking Apple's `qsort` gives the same layout as the native tools on macOS.

## Verification

- `npm test -- --native` builds a ROM that is identical, byte for byte, to the one built by the native `lcc` of GBDK-2020 4.5.0.
- CAPSIMO builds GB Studio 4.3.2 projects with these tools; the ROMs are identical, byte for byte, to those of GB Studio's command line.
- The build is reproducible: building release 1.0.0 again gives the files listed in its `SHA256SUMS`.

## Releases and source code

Each [release](https://github.com/exagyde/sdcc-webassembly/releases) provides:

- `sdcc-webassembly-<version>.zip`: the binaries, runtime modules and licenses;
- `sdcc-webassembly-<version>-source.tar.xz`: their complete source code, i.e. this repository with every third-party source used by `build.sh`. Only Emscripten is downloaded when building from it. SDCC's `device/non-free` directory is left out: it is not free software and the build does not use it.

| Release | SDCC | GBDK-2020 | Emscripten | Used by |
| --- | --- | --- | --- | --- |
| 1.0.0 | 4.5.1 #15267 | 4.5.0 | 6.0.11 | CAPSIMO 1.0.0 |

## License

The code written for this repository is Copyright (C) 2026 Nolann Morencé (exagyde) and licensed under the [GNU General Public License](LICENSE), version 3 or any later version. The SDCC patch is licensed under the GPL version 2 or any later version, like the files it modifies.

The binaries keep the licenses of the software they are built from: GPL-2.0-or-later for `sdcc`; GPL-3.0-or-later for `cc1`, `sdasgb`, `sdld` and `bankpack`; Unlicense for `ihxcheck`; Zlib for `makebin`. [NOTICE.md](NOTICE.md) lists every component, its authors and its license.

The ROMs you build are yours: neither the GPL of the tools nor the license of the GBDK-2020 library (GPL version 2 with a linking exception) applies to them.

## Maintenance

Maintained by Nolann Morencé ([@exagyde](https://github.com/exagyde)). Issues and pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).

This project is not affiliated with the SDCC project, the GBDK-2020 project, GB Studio or Nintendo. Game Boy is a trademark of Nintendo.

## Credits

[SDCC](https://sdcc.sourceforge.net) by Sandeep Dutta and the SDCC developers · ASxxxx by Alan R. Baldwin · [GBDK-2020](https://github.com/gbdk-2020/gbdk-2020) by its contributors · [Emscripten](https://emscripten.org).
