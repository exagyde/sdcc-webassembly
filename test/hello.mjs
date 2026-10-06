// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Nolann Morencé (exagyde)
// Part of sdcc-webassembly, the in-browser compiler engine of CAPSIMO.
//
// Builds test/hello.c into a Game Boy ROM with the WebAssembly tools of dist/
// and checks its header. GBDK_HOME must point to a GBDK-2020 4.5.0 release.
// With --native, also builds it with that release's native lcc and compares
// the two ROMs byte for byte.

import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.env.SDCC_WASM_DIST ?? path.join(here, "../dist"));
const gbdkHome = process.env.GBDK_HOME;
if (!gbdkHome) {
  console.error("GBDK_HOME must point to GBDK-2020 4.5.0: https://github.com/gbdk-2020/gbdk-2020/releases/tag/4.5.0");
  process.exit(1);
}

const { lcc } = await import(pathToFileURL(path.join(dist, "lcc.mjs")).href);

async function collect(dir, virtual, vfs) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const real = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(real, `${virtual}/${entry.name}`, vfs);
    else vfs.set(`${virtual}/${entry.name}`, new Uint8Array(await readFile(real)));
  }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const source = await readFile(path.join(here, "hello.c"));
const vfs = new Map();
for (const dir of ["include", "lib/gb", "lib/sm83"]) await collect(path.join(gbdkHome, dir), `/gbdk/${dir}`, vfs);
vfs.set("/work/hello.c", new Uint8Array(source));
const ctx = { vfs, cwd: "/work", gbdk: "/gbdk" };

const started = performance.now();
await lcc(["-c", "-o", "hello.o", "hello.c"], ctx);
await lcc(["-Wi-e", "-o", "hello.gb", "hello.o"], ctx);
const seconds = ((performance.now() - started) / 1000).toFixed(1);

const rom = vfs.get("/work/hello.gb");
if (!rom) fail("no ROM produced");
if (rom.length < 0x8000 || rom.length % 0x4000) fail(`unexpected ROM size ${rom.length}`);
const logo = [0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83];
if (logo.some((byte, i) => rom[0x104 + i] !== byte)) fail("Nintendo logo missing from the header");
let header = 0;
for (let i = 0x134; i <= 0x14c; i++) header = (header - rom[i] - 1) & 0xff;
if (header !== rom[0x14d]) fail("wrong header checksum");
let global = 0;
rom.forEach((byte, i) => {
  if (i !== 0x14e && i !== 0x14f) global = (global + byte) & 0xffff;
});
if (global !== ((rom[0x14e] << 8) | rom[0x14f])) fail("wrong global checksum");
console.log(`hello.gb: ${rom.length} bytes, header OK, built in ${seconds} s`);

if (process.argv.includes("--native")) {
  const work = await mkdtemp(path.join(tmpdir(), "sdcc-webassembly-"));
  try {
    await writeFile(path.join(work, "hello.c"), source);
    execFileSync(path.join(gbdkHome, "bin", "lcc"), ["-Wi-e", "-o", "hello.gb", "hello.c"], {
      cwd: work,
      stdio: "inherit",
      env: { ...process.env, GBDKDIR: `${path.resolve(gbdkHome)}/` },
    });
    const native = new Uint8Array(await readFile(path.join(work, "hello.gb")));
    const offset = native.findIndex((byte, i) => byte !== rom[i]);
    if (native.length !== rom.length || offset !== -1) fail(`ROM differs from native lcc (first difference at 0x${Math.max(offset, 0).toString(16)})`);
    console.log("hello.gb: identical to the native GBDK-2020 build");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
