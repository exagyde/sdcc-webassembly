# Notices

**sdcc-webassembly**
Copyright (C) 2026 Nolann Morencé (exagyde)

sdcc-webassembly is the in-browser compiler engine of CAPSIMO, an AI-assisted Game Boy game studio created by Nolann Morencé (exagyde). The CAPSIMO name is not licensed under the GPL: a modified version must not use it in a way that suggests it is CAPSIMO or is endorsed by its author.

## Written for this repository

Copyright (C) 2026 Nolann Morencé (exagyde).

| Files | License |
| --- | --- |
| `build.sh`, `scripts/`, `src/`, `shims/`, `test/` | GPL-3.0-or-later ([LICENSE](LICENSE)) |
| `patches/9000_iterative_tree_decomposition.patch` | GPL-2.0-or-later ([licenses/GPL-2.0.txt](licenses/GPL-2.0.txt)), like the SDCC files it modifies |

## WebAssembly binaries

| Binary | Built from | Copyright | License |
| --- | --- | --- | --- |
| `sdcc` | SDCC r15267, GBDK-2020 patch series (gbdk-2020-sdcc `11d1f65`), `patches/9000_iterative_tree_decomposition.patch` | Sandeep Dutta and the SDCC developers, the GBDK-2020 contributors, Nolann Morencé | GPL-2.0-or-later |
| `cc1` | SDCC's preprocessor (sdcpp), derived from GCC's C preprocessor and libiberty | Free Software Foundation, Inc., the SDCC developers | GPL-3.0-or-later |
| `sdasgb`, `sdld` | SDCC's assembler and linker, based on ASxxxx | Alan R. Baldwin, the SDCC developers | GPL-3.0-or-later |
| `bankpack` | GBDK-2020 4.5.0 `gbdk-support/bankpack`, Apple Libc `qsort.c` and `heapsort.c`, `shims/sys/cdefs.h` | bbbbbr; The Regents of the University of California; Nolann Morencé | Unlicense ([licenses/Unlicense.txt](licenses/Unlicense.txt)), BSD-3-Clause ([licenses/BSD-3-Clause.txt](licenses/BSD-3-Clause.txt)) and GPL-3.0-or-later: GPL-3.0-or-later as a whole |
| `ihxcheck` | GBDK-2020 4.5.0 `gbdk-support/ihxcheck` | bbbbbr | Unlicense ([licenses/Unlicense.txt](licenses/Unlicense.txt)) |
| `makebin` | GBDK-2020 4.5.0 `gbdk-support/makebin` | Michael Hope, Borut Razem, Noel Lemouel, Sebastian Riedel, bbbbbr | Zlib ([licenses/makebin-zlib.txt](licenses/makebin-zlib.txt)) |

Every binary (`.wasm` and its `.mjs` loader) also contains parts of Emscripten 6.0.11 and of the system libraries it links:

| Component | License |
| --- | --- |
| Emscripten runtime | MIT or University of Illinois/NCSA ([licenses/Emscripten.txt](licenses/Emscripten.txt)) |
| musl libc | MIT ([licenses/musl.txt](licenses/musl.txt)) |
| LLVM libc++, libc++abi, compiler-rt | Apache-2.0 WITH LLVM-exception ([licenses/LLVM.txt](licenses/LLVM.txt)) |
| zlib 1.3.2, in the tools that use it | Zlib ([licenses/zlib.txt](licenses/zlib.txt)) |

`sdcc` is also compiled with the Boost headers (Boost Software License 1.0, which requires no notice for object code).

## Source code

Each release on GitHub comes with `sdcc-webassembly-<version>-source.tar.xz`: the complete source code of its binaries (this repository, SDCC with the GBDK-2020 patches applied, GBDK-2020 4.5.0, Apple Libc's `qsort.c` and `heapsort.c`, the GBDK-2020 patch series), ready to build with `./build.sh`. SDCC's `device/non-free` directory is left out: it is not free software and the build does not use it.

## GBDK-2020 library

Programs compiled with these tools are linked with the GBDK-2020 library (`crt0.o`, `gb.lib`, `sm83.lib`). It is not part of this repository nor of its binaries. Its license is the GPL version 2 with a linking exception, so the ROMs you build are not covered by the GPL. Its source (`gbdk-lib/`) is included in the source archive, in `vendor/src/gbdk-2020-4.5.0`.

## Trademarks

This project is not affiliated with the SDCC project, the GBDK-2020 project, GB Studio or Nintendo. Game Boy is a trademark of Nintendo.
