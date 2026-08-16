import { NextRequest, NextResponse } from 'next/server';
import { GitHubClient } from 'github-client';

// Simple API wrapper for GitHub operations
// In a real production app, the token should come from NextAuth session
// For now, we will read it from Authorization header or environment variable

export async function POST(req: NextRequest) {
  try {
    const { action, owner, repo, path, message, content, sha, token } = await req.json();

    // In a real app we'd validate the session. 
    // Here we allow passing a PAT from the client for testing, or fallback to an env variable
    const auth = token || process.env.GITHUB_TOKEN;

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: No GitHub token provided' }, { status: 401 });
    }

    const client = new GitHubClient(auth);

    if (action === 'getFile') {
      const data = await client.getFileContent(owner, repo, path);
      return NextResponse.json({ data });
    }

    if (action === 'commitFile') {
      const data = await client.commitFile(owner, repo, path, message, content, sha);
      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('GitHub API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
