# Contributing

sdcc-webassembly is maintained by Nolann Morencé ([@exagyde](https://github.com/exagyde)) as the compiler engine of CAPSIMO. Bug reports and pull requests are welcome. The maintainer reviews every change and decides what is merged.

## Before opening an issue

- A bug that also happens with the native SDCC or GBDK-2020 tools belongs upstream: [SDCC](https://sourceforge.net/p/sdcc/bugs/), [GBDK-2020](https://github.com/gbdk-2020/gbdk-2020/issues).
- Include the browser or Node.js version, the `lcc` arguments and, if you can, the C file that fails.

## Pull requests

- Keep `npm test` passing, with `-- --native` when you have a native GBDK-2020 4.5.0 at hand.
- Say whether the change modifies the binaries, and if so how the generated code changes (SDCC patches must not change it unless that is the point).
- One topic per pull request.

## License of contributions

Contributions are accepted under the license of the files they change: GPL-3.0-or-later, or GPL-2.0-or-later for the SDCC patches in `patches/`.

By submitting a contribution to `src/`, `build.sh`, `scripts/`, `shims/` or `test/`, you also grant Nolann Morencé a perpetual, worldwide, non-exclusive, royalty-free license to use, modify and distribute it under other terms, including in CAPSIMO.
