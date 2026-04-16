import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

export async function startChildProcess(options: {
  childPort: number;
  serverFile: string;
}): Promise<ChildProcess> {
  const child = spawn(process.execPath, [options.serverFile], {
    cwd: path.dirname(options.serverFile),
    env: {
      ...process.env,
      PORT: String(options.childPort),
    },
    stdio: ["inherit", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const handleStdout = (chunk: Buffer) => {
      const text = chunk.toString();

      process.stdout.write(text);

      if (text.includes("Elemental server listening on")) {
        cleanup();
        resolve();
      }
    };
    const handleStderr = (chunk: Buffer) => {
      process.stderr.write(chunk);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`Elemental dev server exited before startup (${signal ?? code ?? 1}).`));
    };
    const cleanup = () => {
      child.stdout?.off("data", handleStdout);
      child.stderr?.off("data", handleStderr);
      child.off("error", handleError);
      child.off("exit", handleExit);
    };

    child.stdout?.on("data", handleStdout);
    child.stderr?.on("data", handleStderr);
    child.once("error", handleError);
    child.once("exit", handleExit);
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  return child;
}

export async function stopChildProcess(childProcess: ChildProcess): Promise<void> {
  if (childProcess.killed || childProcess.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    childProcess.once("exit", () => resolve());
    childProcess.kill("SIGTERM");
  });
}
