/**
 * Cross-platform wrapper that invokes scripts/build-backend.py with the
 * correct Python executable name (``python`` on Windows, ``python3`` elsewhere).
 */

const { spawnSync } = require('child_process');
const path = require('path');

const python = process.platform === 'win32' ? 'python' : 'python3';
const script = path.join(__dirname, 'build-backend.py');

const result = spawnSync(python, [script], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 0);
