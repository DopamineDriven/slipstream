/**
 * Test-only side effect: imported FIRST so picocolors (which reads env at
 * import time) emits real ANSI codes under the piped test runner. Each
 * test file runs in its own process (node --test isolation), so this
 * never leaks into other suites.
 */
process.env.FORCE_COLOR = "1";
