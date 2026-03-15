export async function generateWelcomeMessage(issueTitle: string, _orgId: string): Promise<string> {
    return `**Archon** is beginning to analyze your request: "${issueTitle}".

I will review the context, investigate the codebase, and provide a detailed analysis or fix shortly.

You can track my progress in your Dashboard.`;
}
