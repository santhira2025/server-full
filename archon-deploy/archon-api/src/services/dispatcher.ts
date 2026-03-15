import { Octokit } from "@octokit/rest"
import { getInstallationToken } from "./github.js"

// The GitHub org/user where archon-action is published
// Update this to your actual GitHub org when publishing
const ARCHON_ACTION_REF = process.env.ARCHON_ACTION_REF || "vediyappanm/archon-action@v1"

interface DispatchOptions {
  actionType?: string
  reviewFocus?: string[]
  enableIntentValidation?: boolean
  enableAIAudit?: boolean
}

export async function dispatchAgent(
  installationId: number,
  payload: any,
  plan: any,
  model: string,
  options?: DispatchOptions
) {
  const token = await getInstallationToken(installationId)
  const octokit = new Octokit({ auth: token })

  const { owner, name: repo } = payload.repository
  const issue_number = payload.issue ? payload.issue.number : payload.pull_request?.number
  const comment_id = payload.comment?.id

  const workflowPath = '.github/workflows/archon-managed.yml'

  const actionType = options?.actionType || 'review'
  const reviewFocus = (options?.reviewFocus || ['security', 'bugs', 'style', 'performance']).join(',')
  const enableIntentValidation = options?.enableIntentValidation !== false ? 'true' : 'false'
  const enableAIAudit = options?.enableAIAudit !== false ? 'true' : 'false'

  const workflowContent = `name: archon-managed
on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue or PR number'
        required: true
      comment_id:
        description: 'Comment ID'
        required: false
      action_type:
        description: 'Type: review, resolve, security, explain'
        required: true
        default: 'review'
      model:
        description: 'AI Model'
        required: true
      anthropic_api_key:
        description: 'Anthropic API Key'
        required: true
      archon_token:
        description: 'SaaS Token'
        required: false
      archon_api_url:
        description: 'Archon API URL'
        required: false
      review_focus:
        description: 'Comma-separated focus areas'
        required: false
        default: 'security,bugs,style,performance'
      enable_intent_validation:
        description: 'Enable Intent Validator'
        required: false
        default: 'true'
      enable_ai_audit:
        description: 'Enable AI Code Auditor'
        required: false
        default: 'true'

jobs:
  archon:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Archon Agent
        uses: ${ARCHON_ACTION_REF}
        env:
          GITHUB_TOKEN: \${{ github.token }}
        with:
          issue_number: \${{ github.event.inputs.issue_number }}
          comment_id: \${{ github.event.inputs.comment_id }}
          action_type: \${{ github.event.inputs.action_type }}
          model: \${{ github.event.inputs.model }}
          anthropic_api_key: \${{ github.event.inputs.anthropic_api_key }}
          archon_api_url: \${{ github.event.inputs.archon_api_url }}
          archon_token: \${{ github.event.inputs.archon_token }}
          review_focus: \${{ github.event.inputs.review_focus }}
          enable_intent_validation: \${{ github.event.inputs.enable_intent_validation }}
          enable_ai_audit: \${{ github.event.inputs.enable_ai_audit }}

      - name: Self Cleanup
        if: always()
        env:
          GH_TOKEN: \${{ github.token }}
          REPO: \${{ github.repository }}
        run: |
          echo "Deleting archon-managed.yml via GitHub API..."
          FILE_PATH=".github/workflows/archon-managed.yml"
          SHA=$(curl -s \\
            -H "Authorization: token \${GH_TOKEN}" \\
            -H "Accept: application/vnd.github+json" \\
            "https://api.github.com/repos/\${REPO}/contents/\${FILE_PATH}" | \\
            python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sha',''))" 2>/dev/null || echo "")
          if [ -n "\${SHA}" ]; then
            curl -s -X DELETE \\
              -H "Authorization: token \${GH_TOKEN}" \\
              -H "Accept: application/vnd.github+json" \\
              -H "Content-Type: application/json" \\
              "https://api.github.com/repos/\${REPO}/contents/\${FILE_PATH}" \\
              -d "{\\"message\\":\\"chore: cleanup archon managed workflow [skip ci]\\",\\"sha\\":\\"\${SHA}\\"}" \\
              | python3 -c "import sys,json; d=json.load(sys.stdin); print('Deleted:', d.get('commit',{}).get('sha','unknown'))" \\
              || echo "Warning: API delete failed, will retry on next run"
            echo "Cleanup complete."
          else
            echo "File already deleted or not found, skipping."
          fi
`

  try {
    // Always force-delete and re-inject so we NEVER reuse a stale/broken workflow file
    try {
      const existing = await octokit.repos.getContent({ owner: owner.login, repo, path: workflowPath })
      const existingSha = (existing.data as any).sha
      console.log("Existing workflow found, deleting to re-inject fresh version...")
      await octokit.repos.deleteFile({
        owner: owner.login,
        repo,
        path: workflowPath,
        message: "chore: refresh archon managed workflow",
        sha: existingSha,
      })
      await new Promise(r => setTimeout(r, 1500))
    } catch (e: any) {
      if (e.status !== 404) {
        console.log("Note: Could not delete existing workflow:", e.message)
      }
    }

    console.log("Injecting fresh managed workflow into repo...")
    await octokit.repos.createOrUpdateFileContents({
      owner: owner.login,
      repo,
      path: workflowPath,
      message: "chore: add archon managed workflow",
      content: Buffer.from(workflowContent).toString('base64'),
    })

    // Wait for GitHub to register the new workflow file
    await new Promise(r => setTimeout(r, 3000))

    // Trigger the workflow via workflow_dispatch
    console.log(`Triggering archon-managed.yml on ${owner.login}/${repo}...`)
    await octokit.actions.createWorkflowDispatch({
      owner: owner.login,
      repo,
      workflow_id: 'archon-managed.yml',
      ref: payload.repository.default_branch,
      inputs: {
        issue_number: (issue_number ?? '').toString(),
        comment_id: (comment_id ?? '').toString(),
        action_type: actionType,
        model: model,
        anthropic_api_key: process.env.ANTHROPIC_API_KEY || '',
        archon_api_url: (process.env.ARCHON_API_URL || '').trim(),
        archon_token: Buffer.from(JSON.stringify({ orgId: owner.id })).toString('base64'),
        review_focus: reviewFocus,
        enable_intent_validation: enableIntentValidation,
        enable_ai_audit: enableAIAudit,
      }
    })
    console.log("Agent dispatched successfully!")
    return true
  } catch (error: any) {
    console.error("Failed to dispatch agent:", error.message)
    return false
  }
}
