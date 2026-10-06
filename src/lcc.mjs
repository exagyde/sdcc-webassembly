// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Nolann Morencé (exagyde)
// Part of sdcc-webassembly, the in-browser compiler engine of CAPSIMO.
//
// Replacement for GBDK-2020's lcc driver, which starts processes and cannot run
// in WebAssembly. Game Boy (sm83) target only.
//   lcc -c [-o file.o] file.c|file.s   cc1 → sdcc --c1mode → sdasgb
//   lcc -o game.gb [-autobank] objects  bankpack → sdldgb → ihxcheck → makebin
// Objects can be listed on the command line or in a link file (-Wl-f<file>).
// ctx = { vfs, cwd, gbdk, cache? }: vfs maps absolute paths to Uint8Array,
// gbdk is the GBDK-2020 directory inside vfs (include/, lib/gb/, lib/sm83/),
// cache ({ get(key), set(key, value) }) keeps compiled objects.

import { runTool } from "./toolchain.mjs";

const SDCC_DEFINES = [
  "-D__SDCC_STACK_AUTO",
  "-D__SDCC_CHAR_SIGNED",
  "-D__SDCC_INT_LONG_REENT",
  "-D__SDCC_FLOAT_REENT",
  "-D__SDCCCALL=1",
  "-D__SDCC=4_5_1",
  "-D__SDCC_VERSION_MAJOR=4",
  "-D__SDCC_VERSION_MINOR=5",
  "-D__SDCC_VERSION_PATCH=1",
  "-D__SDCC_REVISION=15267",
  "-D__SDCC_sm83",
  "-D__STDC_NO_COMPLEX__=1",
  "-D__STDC_NO_THREADS__=1",
  "-D__STDC_NO_ATOMICS__=1",
  "-D__STDC_NO_VLA__=1",
  "-D__STDC_ISO_10646__=201409L",
  "-D__SIZEOF_FLOAT__=4",
  "-D__SIZEOF_DOUBLE__=4",
  "-D__SDCC_BITINT_MAXWIDTH=64",
];

// Added after the -Wl options that do not already set them, like GBDK's lcc.
const LINK_DEFAULTS = [
  ["-g", "_shadow_OAM=0xC000"],
  ["-g", ".STACK=0xE000"],
  ["-b", "_DATA=0xC0A0"],
  ["-b", "_CODE=0x0200"],
  ["-b", "_HRAM=0xFF80"],
];

function linkDefaults(flags) {
  return LINK_DEFAULTS.filter(([, value]) => !flags.some((flag) => flag.includes(value.slice(0, value.indexOf("=") + 1)))).flat();
}

const unquote = (s) => s.replace(/^"(.*)"$/, "$1").replace(/"/g, "");

function resolve(cwd, path) {
  const parts = (path.startsWith("/") ? path : `${cwd}/${path}`).split("/");
  const out = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

const dirOf = (path) => path.slice(0, path.lastIndexOf("/")) || "/";
const baseOf = (path) => path.slice(path.lastIndexOf("/") + 1);
const stem = (path) => baseOf(path).replace(/\.[^.]+$/, "");

function parse(args) {
  const opts = { includes: [], defines: [], asm: [], link: [], makebin: [], bankpack: [], ihxcheck: [], sdcc: [], files: [], compile: false, autobank: false, out: null };
  for (let i = 0; i < args.length; i++) {
    const arg = unquote(args[i]);
    if (arg === "-c") opts.compile = true;
    else if (arg === "-o") opts.out = unquote(args[++i]);
    else if (arg === "-autobank") opts.autobank = true;
    else if (arg.startsWith("-I")) opts.includes.push(arg.slice(2));
    else if (arg.startsWith("-D")) opts.defines.push(arg);
    else if (arg.startsWith("-Wa")) opts.asm.push(arg.slice(3));
    else if (arg.startsWith("-Wl")) opts.link.push(arg.slice(3));
    else if (arg.startsWith("-Wm")) opts.makebin.push(arg.slice(3));
    else if (arg.startsWith("-Wb")) opts.bankpack.push(arg.slice(3));
    else if (arg.startsWith("-Wi")) opts.ihxcheck.push(arg.slice(3));
    else if (arg.startsWith("-Wf")) opts.sdcc.push(arg.slice(3));
    else if (arg.startsWith("-m")) continue;
    else if (arg.startsWith("-")) throw new Error(`lcc: unsupported option ${arg}`);
    else opts.files.push(arg);
  }
  return opts;
}

function check(step, result) {
  if (result.code !== 0) {
    const error = new Error(`${step} failed (exit code ${result.code})\n${result.stderr}${result.stdout}`);
    error.log = result.stderr + result.stdout;
    throw error;
  }
  return result;
}

const LCC_ASM = ["-pogN"];
const CACHED_OUTPUTS = ["o"];

async function digest(parts) {
  const chunks = parts.map((part) => (typeof part === "string" ? new TextEncoder().encode(part) : part));
  const joined = new Uint8Array(chunks.reduce((n, c) => n + c.length + 1, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length + 1;
  }
  const hash = await crypto.subtle.digest("SHA-256", joined);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function compileC(file, objFile, opts, ctx) {
  const { vfs, cwd, gbdk } = ctx;
  const obj = resolve(cwd, objFile);
  const objDir = dirOf(obj);
  const base = stem(obj);
  const preprocessed = objFile.replace(/\.[^./]+$/, "") + ".i";
  const includes = [`${gbdk}/lib/gb`, ...opts.includes, `${gbdk}/include`];
  const cppArgs = [
    "-E",
    "-quiet",
    "-nostdinc",
    ...includes.flatMap((dir) => ["-I", dir]),
    "-D__PORT_sm83",
    "-D__TARGET_gb",
    ...opts.defines,
    ...SDCC_DEFINES,
    file,
    "-std=c11",
    "-Wall",
    "-o",
    preprocessed,
  ];
  check("Preprocessing", await runTool("cc1", cppArgs, { vfs, cwd, roots: [objDir] }));
  const input = vfs.get(resolve(cwd, preprocessed));
  vfs.delete(resolve(cwd, preprocessed));
  const sdccOpts = opts.sdcc.filter((o) => o !== "-MMD").map(unquote);
  const sdccArgs = ["-msm83", "--no-std-crt0", "--fsigned-char", "--no-optsdcc-in-asm", ...sdccOpts, "--c1mode", "-o", `${base}.asm`];
  const key = ctx.cache ? await digest([input, sdccArgs.join(" "), base]) : null;
  const cached = key ? await ctx.cache.get(key) : null;
  if (cached) {
    for (const [ext, data] of Object.entries(cached)) vfs.set(`${objDir}/${base}.${ext}`, data);
    return;
  }
  check("Compilation", await runTool("sdcc", sdccArgs, { vfs, cwd: objDir, stdin: input, roots: [objDir] }));
  check("Assembly", await runTool("sdasgb", [...LCC_ASM, "-plosgffw", baseOf(obj), `${base}.asm`], { vfs, cwd: objDir, roots: [objDir] }));
  if (key) {
    const outputs = CACHED_OUTPUTS.map((ext) => [ext, vfs.get(`${objDir}/${base}.${ext}`)]).filter(([, data]) => data);
    await ctx.cache.set(key, Object.fromEntries(outputs));
  }
}

async function compileAsm(file, objFile, opts, ctx) {
  const { vfs, cwd, gbdk } = ctx;
  const args = [...LCC_ASM, `-I${gbdk}/lib/gb`, ...opts.asm, objFile, file];
  check("Assembly", await runTool("sdasgb", args, { vfs, cwd, roots: [dirOf(resolve(cwd, objFile))] }));
}

function splitFlag(flag) {
  const m = flag.match(/^(-[a-zA-Z])(.*)$/);
  return m && m[2] ? [m[1], unquote(m[2])] : [unquote(flag)];
}

function makebinArgs(flags) {
  return flags.flatMap((flag) => {
    const m = flag.match(/^(-y[a-zA-Z])(.*)$/);
    return m && m[2] ? [m[1], unquote(m[2])] : [unquote(flag)];
  });
}

const OBJECT_LIST = "/tmp/lcc-objects.lk";

async function link(opts, ctx) {
  const { vfs, cwd, gbdk } = ctx;
  const out = opts.out;
  if (!out) throw new Error("lcc: -o is required to link");
  const ihx = out.replace(/\.[^./]+$/, "") + ".ihx";
  const outDir = dirOf(resolve(cwd, out));
  const linkFlags = [];
  let linkFile = null;
  for (const flag of opts.link) {
    if (flag.startsWith("-f")) linkFile = flag.slice(2);
    else linkFlags.push(...splitFlag(flag));
  }
  if (!linkFile) {
    linkFile = OBJECT_LIST;
    vfs.set(linkFile, new TextEncoder().encode(opts.files.map((file) => resolve(cwd, file)).join("\n")));
  }
  const cart = opts.makebin.find((f) => f.startsWith("-yt"));
  let lkFile = linkFile;
  if (opts.autobank) {
    lkFile = "/tmp/lcc.lk";
    const bankpack = [...(cart ? [cart] : []), ...opts.bankpack, `-lkout=${lkFile}`, `-lkin=${linkFile}`];
    check("Bank packing", await runTool("bankpack", bankpack, { vfs, cwd, roots: [cwd, "/tmp"] }));
  }
  const sdld = [
    "-n",
    "-i",
    ...linkFlags,
    ...linkDefaults(linkFlags),
    "-k",
    `${gbdk}/lib/sm83/`,
    "-l",
    "sm83.lib",
    "-k",
    `${gbdk}/lib/gb/`,
    "-l",
    "gb.lib",
    ihx,
    `${gbdk}/lib/gb/crt0.o`,
    "-f",
    lkFile,
  ];
  check("Linking", await runTool("sdld", sdld, { vfs, cwd, program: "sdldgb", roots: [outDir] }));
  vfs.delete("/tmp/lcc.lk");
  vfs.delete(OBJECT_LIST);
  if (opts.ihxcheck.length) check("Bank check", await runTool("ihxcheck", [ihx, ...opts.ihxcheck], { vfs, cwd, roots: [] }));
  const makebin = ["-yN", "-Z", ...makebinArgs(opts.makebin), ihx, out];
  check("ROM creation", await runTool("makebin", makebin, { vfs, cwd, roots: [outDir] }));
}

export async function lcc(args, ctx) {
  const opts = parse(args);
  if (opts.compile) {
    const [file] = opts.files;
    const out = opts.out ?? `${stem(file)}.o`;
    if (file.endsWith(".c")) await compileC(file, out, opts, ctx);
    else await compileAsm(file, out, opts, ctx);
  } else {
    await link(opts, ctx);
  }
}
