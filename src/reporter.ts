import chalk from "chalk";
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import type { TestResult, SuiteResult } from "./types.js";

// Live log path is decided once per run by openLogFile() and reused by
// printResult/printSummary. Plain text (no ANSI) so it's tail-friendly.
let logPath: string | null = null;

export function openLogFile(path: string) {
  mkdirSync("results", { recursive: true });
  logPath = path;
  // Truncate any existing file for this run path.
  writeFileSync(path, `# OpenClaw test harness — run started ${new Date().toISOString()}\n`);
  console.log(chalk.dim(`  Log:     ${path}\n`));
}

function appendLog(line: string) {
  if (!logPath) return;
  try {
    // appendFileSync uses fs.write with O_APPEND; flushes per call.
    appendFileSync(logPath, line + "\n");
  } catch {
    // Don't crash the run if logging fails.
  }
}

export function printResult(result: TestResult, index: number, total: number) {
  const num = `[${index + 1}/${total}]`;
  const duration = `(${(result.duration_ms / 1000).toFixed(1)}s)`;

  if (result.passed) {
    console.log(chalk.green(`  PASS ${num} ${result.name} ${duration}`));
    appendLog(`PASS ${num} ${result.name} ${duration}`);
  } else if (result.error) {
    console.log(chalk.red(`  ERR  ${num} ${result.name} ${duration}`));
    console.log(chalk.red(`       ${result.error}`));
    appendLog(`ERR  ${num} ${result.name} ${duration}`);
    appendLog(`     ${result.error}`);
  } else {
    console.log(chalk.red(`  FAIL ${num} ${result.name} ${duration}`));
    appendLog(`FAIL ${num} ${result.name} ${duration}`);
    for (const f of result.failures) {
      console.log(chalk.yellow(`       - ${f}`));
      appendLog(`     - ${f}`);
    }
    if (result.response_text) {
      // Single-line truncated response so a tail -f can see why it failed.
      const oneLine = result.response_text.replace(/\s+/g, " ").slice(0, 200);
      appendLog(`     response: ${oneLine}`);
    }
  }
  // Force the pipe-buffered stdout to flush after each result so external
  // log captures don't only show the last batch.
  if (typeof (process.stdout as { write?: (s: string) => boolean }).write === "function") {
    process.stdout.write("");
  }
}

export function printSummary(suite: SuiteResult) {
  console.log("");
  console.log(chalk.bold("Summary"));
  const summaryLine =
    `  ${chalk.green(`${suite.passed} passed`)}` +
    (suite.failed > 0 ? `, ${chalk.red(`${suite.failed} failed`)}` : "") +
    (suite.errored > 0
      ? `, ${chalk.red(`${suite.errored} errored`)}`
      : "") +
    ` of ${suite.total} tests` +
    ` in ${(suite.duration_ms / 1000).toFixed(1)}s`;
  console.log(summaryLine);

  appendLog("");
  appendLog(
    `Summary: ${suite.passed} passed` +
      (suite.failed > 0 ? `, ${suite.failed} failed` : "") +
      (suite.errored > 0 ? `, ${suite.errored} errored` : "") +
      ` of ${suite.total} tests in ${(suite.duration_ms / 1000).toFixed(1)}s`,
  );
}

export function writeJsonReport(suite: SuiteResult, path: string) {
  mkdirSync("results", { recursive: true });
  writeFileSync(path, JSON.stringify(suite, null, 2));
  console.log(chalk.dim(`  Report: ${path}`));
  appendLog(`Report: ${path}`);
}
