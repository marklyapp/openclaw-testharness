import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import YAML from "yaml";
import type { TestCase } from "./types.js";

export function loadTests(path: string): TestCase[] {
  const stat = statSync(path);

  if (stat.isDirectory()) {
    const files = readdirSync(path)
      .filter((f) => extname(f) === ".yaml" || extname(f) === ".yml")
      .sort();
    return files.flatMap((f) => loadTestFile(join(path, f)));
  }

  return loadTestFile(path);
}

function loadTestFile(filePath: string): TestCase[] {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath}: expected a YAML array of test cases`);
  }

  return parsed.map((item: unknown, i: number) => {
    const tc = item as Record<string, unknown>;
    if (!tc.name || !tc.agent || !tc.prompt || !tc.assert) {
      throw new Error(
        `${filePath}[${i}]: each test needs name, agent, prompt, assert`,
      );
    }
    return tc as unknown as TestCase;
  });
}
