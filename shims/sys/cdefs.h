/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Nolann Morencé (exagyde)
 * Part of sdcc-webassembly, the in-browser compiler engine of CAPSIMO.
 *
 * Minimal <sys/cdefs.h> for compiling Apple's qsort.c and heapsort.c with
 * Emscripten: bankpack is linked with Apple's qsort so that areas of the
 * same size are assigned to banks exactly as on macOS.
 */
#ifndef SYS_CDEFS_H
#define SYS_CDEFS_H
#define __FBSDID(s)
#define __unused __attribute__((__unused__))
#include <stddef.h>
int heapsort(void *, size_t, size_t, int (*)(const void *, const void *));
static inline int fls(int mask) { return mask == 0 ? 0 : 32 - __builtin_clz((unsigned)mask); }
static inline int flsl(long mask) { return mask == 0 ? 0 : (int)(8 * sizeof(long)) - __builtin_clzl((unsigned long)mask); }
#endif
