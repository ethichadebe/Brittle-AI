# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues, in `ethichadebe/Brittle-AI`.

## First, find your GitHub access

There is no one tool that is always present. Check what this session actually
has and use the first that works:

1. **GitHub MCP tools** (`list_issues`, `issue_read`, `issue_write`,
   `add_issue_comment`, `get_label`) — the normal case in a Claude Code cloud
   session, where the `gh` CLI is **not** installed.
2. **The `gh` CLI** — the normal case on a laptop. Confirm with `command -v gh`
   before relying on it.

If neither is available, say so and stop. Do not fall back to writing issues
into the repo as files: the tracker is GitHub, and a markdown file on a branch
is not an issue.

The MCP tools need `owner` and `repo` passed explicitly on every call; `gh`
infers them from the clone. Derive them from `git remote -v` — here,
`owner: ethichadebe`, `repo: Brittle-AI`.

## Operations

| Operation | MCP tools | `gh` |
| --- | --- | --- |
| Create an issue | `issue_write` with `method: "create"`, `title`, `body`, `labels` | `gh issue create --title "..." --body "..."` (heredoc for multi-line) |
| Read an issue | `issue_read` with `method: "get"`, then `"get_comments"` for the thread | `gh issue view <n> --comments` |
| Read its labels | `issue_read` with `method: "get_labels"` | included in `gh issue view --json labels` |
| List issues | `list_issues` with `labels`, `state`, `fields` | `gh issue list --state open --json number,title,body,labels` |
| Comment | `add_issue_comment` with `issue_number`, `body` | `gh issue comment <n> --body "..."` |
| Change labels | `issue_write` with `method: "update"` and the **full** `labels` array | `gh issue edit <n> --add-label "..."` / `--remove-label "..."` |
| Close | `issue_write` with `method: "update"`, `state: "closed"`, `state_reason` | `gh issue close <n> --comment "..."` |

## Three things that differ between the two paths

**Labels replace, they do not append.** `issue_write` sets `labels` to exactly
what you pass, so updating an issue with `labels: ["ready-for-agent"]` silently
drops every other label it had. Read the current set with `issue_read`
`method: "get_labels"` first, then pass the full set you want. `gh issue edit
--add-label` appends, so the same logic written for `gh` is wrong under MCP.

**`state` is upper-case for `list_issues`** (`"OPEN"` / `"CLOSED"`) but
lower-case for `issue_write` (`"open"` / `"closed"`). `gh` is lower-case
throughout.

**Labels must already exist.** Neither path creates a label on the fly — the
call fails instead. Check with `get_label` if unsure. The five this repo uses
are in `docs/agents/triage-labels.md`, and all five exist on the repo today.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read the issue and its comments.
