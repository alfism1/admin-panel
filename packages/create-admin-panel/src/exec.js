/** Subprocess helpers. Output is buffered so a spinner can own the terminal. */
import { spawn } from 'node:child_process';

/**
 * Never `shell: true` — every argument here can contain a user-supplied string
 * (a project name, a connection string), and a shell would happily interpret it.
 */
export function exec(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}${error.message}` });
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

/** The last few lines of a failed command — the whole buffer is rarely the useful part. */
export function tail(output, lines = 12) {
  return output.trim().split('\n').slice(-lines).join('\n');
}

export async function hasCommand(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = await exec(probe, [command]);
  return result.ok;
}
