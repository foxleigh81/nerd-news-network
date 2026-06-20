import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('commit-time validation gate', () => {
  it('installs a tracked pre-commit hook that runs deterministic article validation before commits', () => {
    expect(existsSync('.githooks/pre-commit')).toBe(true);
    const hook = readFileSync('.githooks/pre-commit', 'utf8');
    expect(hook).toContain('npm test');
    expect(hook).toContain('npm run validate:articles');
    expect(hook).toContain('npm run build');
    expect(hook).toContain('npm run validate:output');
    expect(hook).toContain('git diff --quiet');
  });
});
