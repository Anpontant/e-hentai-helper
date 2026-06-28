#!/usr/bin/env node
// PostToolUse(Write|Edit) hook: format the just-written file with Prettier,
// mirroring `prettier --write --ignore-unknown <file>`. A formatting hiccup must
// never block the edit flow, so every failure path exits 0.
import { readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";

const filePath = await fileFromStdin();
if (!filePath) process.exit(0);

try {
  const info = await prettier.getFileInfo(filePath, {
    ignorePath: [".gitignore", ".prettierignore"],
  });
  if (info.ignored || !info.inferredParser) process.exit(0); // == --ignore-unknown

  const source = await readFile(filePath, "utf8");
  const config = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(source, { ...config, filepath: filePath });
  if (formatted !== source) await writeFile(filePath, formatted);
} catch {
  // swallow: never break a write because of formatting
}
process.exit(0);

async function fileFromStdin() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw)?.tool_input?.file_path ?? "";
  } catch {
    return "";
  }
}
