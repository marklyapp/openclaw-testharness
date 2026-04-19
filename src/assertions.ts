import type { TestCase } from "./types.js";

export function runAssertions(text: string, assert: TestCase["assert"]): string[] {
  const failures: string[] = [];
  const lower = text.toLowerCase();

  for (const keyword of assert.contains ?? []) {
    if (!lower.includes(keyword.toLowerCase())) {
      failures.push(`expected response to contain "${keyword}"`);
    }
  }

  for (const keyword of assert.not_contains ?? []) {
    if (lower.includes(keyword.toLowerCase())) {
      failures.push(`expected response NOT to contain "${keyword}"`);
    }
  }

  for (const pattern of assert.matches ?? []) {
    if (!new RegExp(pattern, "is").test(text)) {
      failures.push(`expected response to match /${pattern}/`);
    }
  }

  for (const pattern of assert.not_matches ?? []) {
    if (new RegExp(pattern, "is").test(text)) {
      failures.push(`expected response NOT to match /${pattern}/`);
    }
  }

  if (assert.min_length != null && text.length < assert.min_length) {
    failures.push(`response length ${text.length} < min ${assert.min_length}`);
  }

  if (assert.max_length != null && text.length > assert.max_length) {
    failures.push(`response length ${text.length} > max ${assert.max_length}`);
  }

  return failures;
}
