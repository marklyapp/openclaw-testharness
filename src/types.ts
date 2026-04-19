export interface TestCase {
  name: string;
  agent: string;
  prompt: string;
  timeout_ms?: number;
  assert: {
    contains?: string[];
    not_contains?: string[];
    matches?: string[];
    not_matches?: string[];
    min_length?: number;
    max_length?: number;
  };
}

export interface TestResult {
  name: string;
  agent: string;
  passed: boolean;
  duration_ms: number;
  response_text: string;
  failures: string[];
  error?: string;
}

export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  duration_ms: number;
  results: TestResult[];
}
