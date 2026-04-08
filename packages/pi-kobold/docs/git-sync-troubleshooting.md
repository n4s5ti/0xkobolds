# Troubleshooting

Common issues and their solutions.

## "❌ UNKNOWN_ORG"

**Cause:** No GitHub org could be detected from git remotes.

**Fix:** Pass `org` explicitly, or add it to `.git-sync.json`:

```json
{ "org": "my-team" }
```

Or add a GitHub remote to the repo:

```bash
git remote add origin https://github.com/my-team/my-repo.git
```

---

## Push rejected (diverged)

**Cause:** The individual repo has commits that the monorepo doesn't (or vice versa).

**Fix (option 1):** Force push from the monorepo (monorepo is source of truth):

```
git_package_push(name="lib-core", force=true)
```

**Fix (option 2):** Pull from the individual repo first, resolve, then push:

```
git_package_pull(name="lib-core")
# resolve any conflicts
git_package_push(name="lib-core")
```

---

## Subtree pull: "can't squash-merge: was never added"

**Cause:** The subdirectory was never formally added via `git subtree add`. This happens when the directory was copied in rather than pulled from the individual repo.

**Fix:** Use the split→merge approach:

```bash
# From the monorepo root
git fetch pkg-lib-core main
git merge -s ours --no-commit --allow-unrelated-histories pkg-lib-core/main
git read-tree --prefix=packages/lib-core -u pkg-lib-core/main
git commit -m "sync: merge lib-core from individual repo"
```

After this initial merge, future `git_package_pull` calls will work normally.

---

## Pre-push hook rejects direct push to main

**Cause:** The individual repo has branch protection enabled.

**Fix:** Push to a feature branch and create a PR instead:

```bash
# Split and push to a branch
git subtree split --prefix=packages/lib-core -b _push-lib-core
git push pkg-lib-core _push-lib-core:feat/sync-$(date +%Y%m%d)

# Create a PR
git_pr(repo="lib-core", title="Sync from monorepo", head="feat/sync-20260408")
```

Alternatively, bypass hooks locally:

```bash
git push pkg-pi-mcp _push-lib-core:main --no-verify
```

---

## Permission denied (publickey)

**Cause:** SSH key not configured for the GitHub remote.

**Fix:** Use HTTPS remotes instead of SSH:

```bash
git remote set-url pkg-lib-core https://github.com/my-team/lib-core.git
```

Or configure SSH keys: [GitHub SSH setup](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)

---

## Subtree split is slow

**Cause:** `git subtree split` replays every commit that touched the prefix directory. For repos with long histories, this can take minutes.

**Mitigation:**

1. **Use `--squash` on pull** (default) — keeps the individual repo history linear
2. **Use `--rejoin`** — merges the split branch back, making subsequent splits faster
3. **Shallow clones** — if individual repos don't need full history

---

## "❌ Failed to create GitHub repo"

**Cause:** `gh` CLI not authenticated, or org/repo name conflict.

**Fix:**

1. Check `gh` auth: `gh auth status`
2. Login: `gh auth login`
3. Check if repo already exists: `gh repo view my-team/my-repo`

---

## Merge conflicts during pull

**Cause:** Both the monorepo and individual repo modified the same files.

**Resolution steps:**

1. Edit the conflicted files in the prefix directory (e.g. `packages/lib-core/`)
2. Stage the resolved files: `git add packages/lib-core/`
3. Commit: `git commit -m "merge: resolve conflicts from lib-core sync"`

The tool will provide the exact paths and commands when conflicts occur.