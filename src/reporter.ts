import chalk from "chalk";
import { writeFileSync, mkdirSync } from "node:fs";
import type { TestResult, SuiteResult } from "./types.js";

export function printResult(result: TestResult, index: number, total: number) {
  const num = `[${index + 1}/${total}]`;
  const duration = `(${(result.duration_ms / 1000).toFixed(1)}s)`;

  if (result.passed) {
    console.log(chalk.green(`  PASS ${num} ${result.name} ${duration}`));
  } else if (result.error) {
    console.log(chalk.red(`  ERR  ${num} ${result.name} ${duration}`));
    console.log(chalk.red(`       ${result.error}`));
  } else {
    console.log(chalk.red(`  FAIL ${num} ${result.name} ${duration}`));
    for (const f of result.failures) {
      console.log(chalk.yellow(`       - ${f}`));
    }
  }
}

export function printSummary(suite: SuiteResult) {
  console.log("");
  console.log(chalk.bold("Summary"));
  console.log(
    `  ${chalk.green(`${suite.passed} passed`)}` +
      (suite.failed > 0 ? `, ${chalk.red(`${suite.failed} failed`)}` : "") +
      (suite.errored > 0
        ? `, ${chalk.red(`${suite.errored} errored`)}`
        : "") +
      ` of ${suite.total} tests` +
      ` in ${(suite.duration_ms / 1000).toFixed(1)}s`,
  );
}

export function writeJsonReport(suite: SuiteResult, path: string) {
  mkdirSync("results", { recursive: true });
  writeFileSync(path, JSON.stringify(suite, null, 2));
  console.log(chalk.dim(`  Report: ${path}`));
}
