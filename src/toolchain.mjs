// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Nolann Morencé (exagyde)
// Part of sdcc-webassembly, the in-browser compiler engine of CAPSIMO.
//
// Loads the WebAssembly tools of toolchain/ and runs them like command line
// programs: input files come from a Map (path → Uint8Array), and the files the
// tool writes are added to that same Map. Works in browsers, workers and Node.

const DIST = new URL("toolchain/", import.meta.url);
const isNode = typeof process !== "undefined" && !!process.versions?.node;
let query = "";

const factories = new Map();
const modules = new Map();

async function readBinary(url) {
  if (isNode && url.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    return readFile(url);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

function factory(name) {
  if (!factories.has(name)) factories.set(name, import(new URL(`${name}.mjs${query}`, DIST).href).then((m) => m.default));
  return factories.get(name);
}

function compiled(name) {
  if (!modules.has(name)) modules.set(name, readBinary(new URL(`${name}.wasm${query}`, DIST)).then((bytes) => WebAssembly.compile(bytes)));
  return modules.get(name);
}

export const TOOLS = ["cc1", "sdcc", "sdasgb", "sdld", "bankpack", "ihxcheck", "makebin"];

// Downloads and compiles every tool ahead of time. `version` is appended to
// the URLs (?v=…) so that a new deployment never reuses stale cached files.
export function preload(version = "") {
  query = version ? `?v=${version}` : "";
  return Promise.all(TOOLS.flatMap((name) => [factory(name), compiled(name)]));
}

function dirname(path) {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

function* walk(FS, dir) {
  for (const name of FS.readdir(dir)) {
    if (name === "." || name === "..") continue;
    const path = dir === "/" ? `/${name}` : `${dir}/${name}`;
    if (path === "/dev" || path === "/proc") continue;
    const node = FS.lookupPath(path).node;
    if (FS.isDir(node.mode)) yield* walk(FS, path);
    else if (FS.isFile(node.mode)) yield [path, node];
  }
}

// Runs one tool. Each call gets a fresh instance with its own memory and file
// system: the files of `vfs` are copied in, the tool runs in `cwd`, then every
// file created or changed under `roots` is copied back into `vfs`.
// `program` is the name the tool sees as argv[0] (sdld must run as sdldgb).
export async function runTool(name, args, { vfs, cwd = "/", stdin, program = name, roots = ["/"] } = {}) {
  const [create, wasmModule] = await Promise.all([factory(name), compiled(name)]);
  let stdout = "";
  let stderr = "";
  const input = stdin ?? new Uint8Array(0);
  let cursor = 0;
  const mod = await create({
    thisProgram: program,
    print: (text) => (stdout += `${text}\n`),
    printErr: (text) => (stderr += `${text}\n`),
    stdin: () => (cursor < input.length ? input[cursor++] : null),
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(wasmModule, imports).then((instance) => done(instance, wasmModule));
      return {};
    },
  });
  const { FS } = mod;
  const given = new Map();
  for (const [path, data] of vfs) {
    FS.mkdirTree(dirname(path));
    FS.writeFile(path, data, { canOwn: true });
    given.set(path, FS.lookupPath(path).node.contents);
  }
  for (const dir of [cwd, ...roots]) FS.mkdirTree(dir);
  FS.chdir(cwd);
  let code = 0;
  try {
    code = mod.callMain(args) ?? 0;
  } catch (error) {
    if (typeof error?.status === "number") code = error.status;
    else throw error;
  }
  if (isNode && process.exitCode) process.exitCode = 0;
  for (const root of roots) {
    if (!FS.analyzePath(root).exists) continue;
    for (const [path, node] of walk(FS, root)) {
      if (given.get(path) === node.contents && given.has(path)) continue;
      vfs.set(path, node.contents ? new Uint8Array(node.contents.buffer, node.contents.byteOffset, node.usedBytes).slice() : new Uint8Array(0));
    }
  }
  return { code, stdout, stderr };
}
