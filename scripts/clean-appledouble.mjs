#!/usr/bin/env node

import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const SKIP_DIRECTORIES = new Set([".git", ".next", ".vercel", "node_modules"]);

async function clean(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.name.startsWith("._")) {
      await rm(entryPath, { force: true, recursive: entry.isDirectory() });
      removed += 1;
      continue;
    }
    if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name)) {
      removed += await clean(entryPath);
    }
  }

  return removed;
}

const removed = await clean(process.cwd());
if (removed > 0) {
  console.log(`Removed ${removed} AppleDouble sidecar file${removed === 1 ? "" : "s"}.`);
}
