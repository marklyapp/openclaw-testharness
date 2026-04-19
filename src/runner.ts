import type { TestCase, TestResult, SuiteResult } from "./types.js";
import { TestClient } from "./client.js";
import { runAssertions } from "./assertions.js";

export async function runSuite(
  client: TestClient,
  tests: TestCase[],
  onResult?: (result: TestResult, index: number, total: number) => void,
): Promise<SuiteResult> {
  const results: TestResult[] = [];
  const suiteStart = Date.now();

  for (let i = 0; i < tests.length; i++) {
    const tc = tests[i];
    const start = Date.now();
    let result: TestResult;

    try {
      const response = await client.sendChat(
        tc.agent,
        tc.prompt,
        tc.timeout_ms ?? 120000,
      );
      const failures = runAssertions(response, tc.assert);

      result = {
        name: tc.name,
        agent: tc.agent,
        passed: failures.length === 0,
        duration_ms: Date.now() - start,
        response_text: response.slice(0, 500),
        failures,
      };
    } catch (err) {
      result = {
        name: tc.name,
        agent: tc.agent,
        passed: false,
        duration_ms: Date.now() - start,
        response_text: "",
        failures: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }

    results.push(result);
    onResult?.(result, i, tests.length);
  }

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed && !r.error).length,
    errored: results.filter((r) => !!r.error).length,
    duration_ms: Date.now() - suiteStart,
    results,
  };
}
