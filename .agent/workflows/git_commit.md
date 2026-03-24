---
description: LexFlow Backend git commit workflow — handles both the parent repo (lexflow-backend) and the CODEX submodule (codex/) correctly. Includes hygiene checks, multi-repo commit ordering, and safe push.
---

# /git_commit

> Commit changes in the lexflow-backend repo, handling the CODEX submodule correctly.

## Safe Command Rules

- **`GIT_TERMINAL_PROMPT=0`** — Prefix ALL git network commands (`push`, `pull`, `fetch`).
- **Never poll `command_status` more than twice** — Verify outcomes directly instead.
- **Verify outcomes, not process status**:
  | Instead of checking... | Verify by running... |
  |---|---|
  | "Did git commit finish?" | `git log --oneline -1` |
  | "Did the push work?" | `GIT_TERMINAL_PROMPT=0 git log --oneline origin/main..HEAD` |
  | "Is the tree clean?" | `git status --porcelain` |

---

// turbo
## Step 1: Identify Repo Root

```bash
cd /home/bdavidriggins/Documents/lexflow/lexflow-backend
git rev-parse --show-toplevel
```

All subsequent commands run from this root unless explicitly noted.

---

## Step 2: Check Status & Hygiene (Parent Repo)

```bash
git status
```

### 2a. Junk File & Secret Scan

Verify NONE of these appear in the changelist:

| Pattern | Action |
|:--------|:-------|
| `*.log`, `__pycache__/`, `.pytest_cache/`, `node_modules/` | Add to `.gitignore` |
| `.env`, `*.pem`, `*.key`, `*secret*`, `*credential*` | **STOP — never commit secrets** |
| `dist/`, `coverage/`, `.pm2/`, `drizzle/meta/` | Already in `.gitignore` — if staged, unstage |

```bash
# Scan staged files for secrets
git diff --cached --name-only | xargs grep -l -i -E '(api[_-]?key|password|secret|token|credential|private[_-]?key)' 2>/dev/null
```

If real secrets found → **STOP**. Remove and use env vars.

---

// turbo
## Step 3: Check Submodule Status

Determine if the CODEX submodule (`codex/`) has uncommitted changes:

```bash
cd codex && git status --porcelain && cd ..
```

**Three possible states:**

| State | `git status` in `codex/` | Action |
|:------|:------------------------|:-------|
| **Clean** | Empty output | Skip to Step 5 (parent commit only) |
| **Has changes** | Shows modified/untracked files | Continue to Step 4 (commit submodule first) |
| **Detached HEAD** | `HEAD detached at ...` | Run `cd codex && git checkout main && cd ..` then re-check |

---

// turbo-all
## Step 4: Commit Submodule Changes (if needed)

> **CRITICAL**: Submodule changes must be committed and pushed BEFORE the parent repo commit. Otherwise the parent will point to a commit that doesn't exist on the remote.

### 4a. Commit inside the submodule

```bash
cd codex
git add -A
git status
```

Review what's staged, then commit using the standard message format:

```bash
git commit -m "docs(SPR-NNN): description" \
  -m "Why: reason for the CODEX change" \
  -m "Agent: backend"
```

### 4b. Push the submodule

```bash
GIT_TERMINAL_PROMPT=0 git push origin main
```

### 4c. Return to parent

```bash
cd ..
```

### 4d. Verify submodule push

```bash
cd codex && GIT_TERMINAL_PROMPT=0 git log --oneline origin/main..HEAD && cd ..
```

If output is empty → push succeeded. If commits remain → push failed, investigate.

---

## Step 5: Stage & Commit Parent Repo

### 5a. Stage Changes

```bash
git add -A
git status
```

> [!IMPORTANT]
> `git add -A` will stage:
> - Your source code changes (`.ts`, config files, scripts, etc.)
> - The updated submodule pointer for `codex/` (if Step 4 was performed)
>
> Both MUST be committed together so the parent always references the correct submodule commit.

### 5b. Verify Staged Content

Review the diff before committing:

```bash
git diff --cached --stat
```

If `codex` appears as a "modified submodule" → this is expected after Step 4.

### 5c. Commit

Use [Conventional Commits](https://www.conventionalcommits.org/) with structured fields:

```bash
git commit -m "type(scope): summary (imperative mood, ≤72 chars)" \
  -m "Why: motivation for this change" \
  -m "What: what specifically changed" \
  -m "Agent: backend" \
  -m "Refs: SPR-001, CON-002"
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `style`

**Commit Quality Checklist:**
- [ ] Subject line in **imperative mood**, ≤72 chars
- [ ] `Agent: backend` present
- [ ] `Why:` explains motivation
- [ ] `Refs:` links to CODEX doc IDs
- [ ] Each commit = **one logical change**

---

## Step 6: Push Parent Repo (optional)

Only push when the architect requests it.

```bash
GIT_TERMINAL_PROMPT=0 git push origin main
```

**If push is rejected** (upstream has new commits):

```bash
git stash --include-untracked
GIT_TERMINAL_PROMPT=0 git pull --rebase origin main
git stash pop 2>/dev/null
GIT_TERMINAL_PROMPT=0 git push origin main
```

If rebase has conflicts → report to the architect, do NOT auto-resolve.

---

// turbo
## Step 7: Final Verification

```bash
git status
git log --oneline -3
cd codex && git log --oneline -1 && cd ..
```

- Parent tree clean ✓
- Submodule tree clean ✓
- Recent commits visible ✓

---

## Quick Reference: Commit Order

```
1. cd codex/          ← Enter submodule
2. git add + commit   ← Commit CODEX changes
3. git push           ← Push submodule to remote
4. cd ..              ← Return to parent
5. git add -A         ← Stage source + updated submodule pointer
6. git commit         ← Commit parent
7. git push           ← Push parent to remote
```

> [!CAUTION]
> **Never push the parent before the submodule.** The parent's commit will reference a submodule commit that doesn't exist on the remote, breaking `git clone --recursive` for everyone.
