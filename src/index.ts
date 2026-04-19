import { program } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import { TestClient } from "./client.js";
import { loadTests } from "./loader.js";
import { runSuite } from "./runner.js";
import { printResult, printSummary, writeJsonReport } from "./reporter.js";

function loadGatewayConfig(): { url: string; token: string } | null {
  // Search common openclaw config locations
  const candidates = [
    join(homedir(), ".openclaw", "openclaw.json"),
    join(homedir(), ".openclaw-devpod", "openclaw.json"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const cfg = JSON.parse(readFileSync(p, "utf-8"));
        const port = cfg.gateway?.port ?? 18789;
        const token = cfg.gateway?.auth?.token;
        if (token) {
          return { url: `ws://127.0.0.1:${port}`, token };
        }
      } catch {
        // skip
      }
    }
  }
  return null;
}

program
  .name("openclaw-testharness")
  .description("Behavioral test harness for OpenClaw agent workflows")
  .requiredOption("--suite <path>", "Path to test YAML file or directory")
  .option("--url <ws://...>", "Gateway WebSocket URL")
  .option("--token <string>", "Gateway auth token")
  .option("--timeout <ms>", "Default timeout per test (ms)", "120000")
  .option("--json", "Write JSON report to results/")
  .option("--config <path>", "Path to openclaw.json (auto-detected if omitted)")
  .parse();

const opts = program.opts();

// Resolve gateway connection
let url = opts.url as string | undefined;
let token = opts.token as string | undefined;

if (!url || !token) {
  let configPath = opts.config as string | undefined;
  let cfg: { url: string; token: string } | null = null;

  if (configPath) {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const port = raw.gateway?.port ?? 18789;
    cfg = { url: `ws://127.0.0.1:${port}`, token: raw.gateway?.auth?.token };
  } else {
    cfg = loadGatewayConfig();
  }

  if (cfg) {
    url = url ?? cfg.url;
    token = token ?? cfg.token;
  }
}

if (!url || !token) {
  console.error(
    chalk.red(
      "Could not find gateway config. Use --url and --token, or --config <path>.",
    ),
  );
  process.exit(1);
}

// Load tests
const suitePath = resolve(opts.suite as string);
console.log(chalk.bold(`\nOpenClaw Test Harness`));
console.log(chalk.dim(`  Gateway: ${url}`));
console.log(chalk.dim(`  Suite:   ${suitePath}\n`));

let tests;
try {
  tests = loadTests(suitePath);
} catch (err) {
  console.error(chalk.red(`Failed to load tests: ${err}`));
  process.exit(1);
}

console.log(`Running ${tests.length} tests...\n`);

// Connect and run
const client = new TestClient(url, token);

try {
  await client.start();
} catch (err) {
  console.error(chalk.red(`Failed to connect to gateway: ${err}`));
  process.exit(1);
}

const suite = await runSuite(client, tests, printResult);
printSummary(suite);

if (opts.json) {
  const reportPath = `results/report-${Date.now()}.json`;
  writeJsonReport(suite, reportPath);
}

await client.stop();
process.exit(suite.failed + suite.errored > 0 ? 1 : 0);
