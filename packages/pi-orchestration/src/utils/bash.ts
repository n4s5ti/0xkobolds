/**
 * Bash Utilities
 * 
 * Simple bash execution with Bun's API.
 */

export interface BashOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Simple shell escape to prevent command injection
 * Wraps string in single quotes and escapes existing single quotes
 */
export function quote(val: string): string {
  return `'${val.replace(/'/g, "'\\''")}'`;
}

/**
 * Execute a bash command with timeout
 */
export async function bash(
  command: string,
  options: BashOptions = {}
): Promise<BashResult> {
  const timeout = options.timeout || 60000;
  
  try {
    const result = Bun.spawn({
      cmd: ["/bin/bash", "-c", command],
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      result.kill();
    }, timeout);
    
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(result.stdout).text(),
      new Response(result.stderr).text(),
      result.exited.then(() => result.exitCode),
    ]);
    
    clearTimeout(timeoutId);
    
    return {
      stdout,
      stderr,
      exitCode: exitCode as number,
    };
  } catch (error) {
    throw new Error(`bash failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
