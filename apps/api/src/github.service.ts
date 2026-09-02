import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createAppAuth } from "@octokit/auth-app";
import { readFileSync } from "node:fs";

export type GitHubRepository = {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
};

@Injectable()
export class GitHubService {
  private readonly appId = process.env.GITHUB_APP_ID;
  private readonly privateKey = process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? (process.env.GITHUB_PRIVATE_KEY_PATH ? readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, "utf8") : undefined);

  private async token(installationId: string) {
    if (!this.appId || !this.privateKey) throw new InternalServerErrorException("GitHub App is not configured");
    const auth = createAppAuth({ appId: this.appId, privateKey: this.privateKey });
    const result = await auth({ type: "installation", installationId });
    return result.token;
  }

  async listRepositories(installationId: string): Promise<GitHubRepository[]> {
    const token = await this.token(installationId);
    const response = await fetch("https://api.github.com/installation/repositories?per_page=100", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new InternalServerErrorException("Unable to read GitHub repositories");
    const body = await response.json() as { repositories: GitHubRepository[] };
    return body.repositories;
  }

  async resolveCommit(installationId: string, fullName: string, ref: string) {
    const token = await this.token(installationId);
    const response = await fetch(`https://api.github.com/repos/${fullName}/commits/${encodeURIComponent(ref)}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new InternalServerErrorException("Unable to resolve GitHub commit");
    const body = await response.json() as { sha: string };
    return body.sha;
  }
}
