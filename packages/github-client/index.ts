import { Octokit } from 'octokit';

// A wrapper client for GitHub API using octokit
// This simplifies fetching and committing markdown files to the remote repository
export class GitHubClient {
  private octokit: Octokit;

  constructor(auth: string) {
    this.octokit = new Octokit({ auth });
  }

  // Fetch the contents of a specific file in a repository
  // Returns base64 or raw string depending on the API result
  async getFileContent(owner: string, repo: string, path: string) {
    const response = await this.octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
    
    return response.data;
  }

  // Commit changes to a file in a repository
  // Handles creating or updating a file with a specified commit message
  async commitFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    content: string, // base64 encoded content
    sha?: string // required if updating an existing file
  ) {
    const response = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content,
      sha,
    });

    return response.data;
  }
}
