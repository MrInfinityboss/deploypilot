import { EventEmitter } from "node:events";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import { DockerAdapter } from "./docker-adapter.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
const mockedSpawn = vi.mocked(spawn);

describe("DockerAdapter safety boundary", () => {
  const adapter = new DockerAdapter();
  const profile = { strategy: "DOCKERFILE" as const, timeoutSeconds: 60, requiredSecretNames: [] };
  const policy = { timeoutSeconds: 60, memoryLimitMb: 512, cpuLimit: 1, pidsLimit: 128, networkMode: "none" as const };

  beforeEach(() => mockedSpawn.mockReset());

  it("rejects shell-like image names", async () => {
    await expect(adapter.build("bad;rm -rf /", ".", profile, policy)).rejects.toThrow("Unsafe Docker image name");
  });

  it("rejects option-like build contexts", async () => {
    await expect(adapter.build("safe-image", "--privileged", profile, policy)).rejects.toThrow("Unsafe Docker execution policy");
  });

  it("rejects excessive memory and process limits", async () => {
    await expect(adapter.build("safe-image", ".", profile, { ...policy, memoryLimitMb: 8192 })).rejects.toThrow("Unsafe Docker execution policy");
    await expect(adapter.build("safe-image", ".", profile, { ...policy, pidsLimit: 1024 })).rejects.toThrow("Unsafe Docker execution policy");
  });

  it("fails when Docker exits with a non-zero code", async () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    mockedSpawn.mockReturnValue(child as never);
    const promise = adapter.build("safe-image", ".", profile, policy);
    child.stderr.emit("data", Buffer.from("Dockerfile syntax error"));
    child.emit("close", 1);
    await expect(promise).rejects.toThrow("Docker build failed with exit code 1");
    await expect(promise).rejects.toThrow("Dockerfile syntax error");
  });

  it("terminates an active Docker build when aborted", async () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = vi.fn();
    mockedSpawn.mockReturnValue(child as never);
    const controller = new AbortController();
    const promise = adapter.build("safe-image", ".", profile, policy, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow("Docker execution cancelled");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("passes resource limits to Docker", async () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    mockedSpawn.mockReturnValue(child as never);
    const promise = adapter.build("safe-image", ".", profile, policy);
    child.emit("close", 0);
    await expect(promise).resolves.toMatchObject({ code: 0 });
    expect(mockedSpawn).toHaveBeenCalledWith("docker", expect.arrayContaining(["--memory", "512m", "--cpus", "1", "--pids-limit", "128", "--network", "none"]), expect.anything());
  });
});
