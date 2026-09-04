import { spawn } from "node:child_process";
import type { BuildProfile } from "@deploypilot/shared";

export type DockerExecutionPolicy = {
  timeoutSeconds: number;
  memoryLimitMb: number;
  cpuLimit: number;
  pidsLimit: number;
  networkMode: "none" | "bridge";
};

export class DockerExecutionCancelledError extends Error {
  constructor() {
    super("Docker execution cancelled");
    this.name = "DockerExecutionCancelledError";
  }
}

export class DockerAdapter {
  async build(image: string, context: string, profile: BuildProfile, policy: DockerExecutionPolicy, signal?: AbortSignal) {
    this.assertSafe(image, context, policy);
    const timeout = Math.min(profile.timeoutSeconds, policy.timeoutSeconds) * 1000;
    // The command is deliberately isolated here so it can later be replaced by a Docker SDK.
    // Never interpolate repository-controlled values into a shell string.
    return this.run("docker", ["build", "--tag", image, "--memory", `${policy.memoryLimitMb}m`, "--cpus", String(policy.cpuLimit), "--pids-limit", String(policy.pidsLimit), "--network", policy.networkMode, context], timeout, signal);
  }

  private assertSafe(image: string, context: string, policy: DockerExecutionPolicy) {
    if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(image)) throw new Error("Unsafe Docker image name");
    if (context.includes("\0") || context.startsWith("-") || policy.memoryLimitMb > 4096 || policy.pidsLimit > 512) throw new Error("Unsafe Docker execution policy");
  }

  private run(command: string, args: string[], timeoutMs: number, signal?: AbortSignal) {
    return new Promise<{ code: number; output: string }>((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      let settled = false;
      let forceKillTimer: NodeJS.Timeout | undefined;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        signal?.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () => {
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        finish(() => reject(new DockerExecutionCancelledError()));
      };
      const timer = setTimeout(() => { child.kill("SIGKILL"); finish(() => reject(new Error("Docker execution timed out"))); }, timeoutMs);
      const append = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-200_000); };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (error) => finish(() => reject(error)));
      child.on("close", (code) => finish(() => {
        const result = { code: code ?? 1, output };
        if (result.code !== 0) reject(new Error(`Docker build failed with exit code ${result.code}: ${output.trim().slice(-4000)}`));
        else resolve(result);
      }));
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
