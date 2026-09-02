import { spawn } from "node:child_process";
import type { BuildProfile } from "@deploypilot/shared";

export type DockerExecutionPolicy = {
  timeoutSeconds: number;
  memoryLimitMb: number;
  cpuLimit: number;
  pidsLimit: number;
  networkMode: "none" | "bridge";
};

export class DockerAdapter {
  async build(image: string, context: string, profile: BuildProfile, policy: DockerExecutionPolicy) {
    this.assertSafe(image, context, policy);
    const timeout = Math.min(profile.timeoutSeconds, policy.timeoutSeconds) * 1000;
    // The command is deliberately isolated here so it can later be replaced by a Docker SDK.
    // Never interpolate repository-controlled values into a shell string.
    return this.run("docker", ["build", "--tag", image, context], timeout);
  }

  private assertSafe(image: string, context: string, policy: DockerExecutionPolicy) {
    if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(image)) throw new Error("Unsafe Docker image name");
    if (context.includes("\0") || context.startsWith("-") || policy.memoryLimitMb > 4096 || policy.pidsLimit > 512) throw new Error("Unsafe Docker execution policy");
  }

  private run(command: string, args: string[], timeoutMs: number) {
    return new Promise<{ code: number; output: string }>((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Docker execution timed out")); }, timeoutMs);
      child.stdout.on("data", (chunk) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk) => { output += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, output }); });
    });
  }
}
