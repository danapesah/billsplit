---
name: push
description: Commit and push code to git. Use when the user says to push, ship, or commit the code.
disable-model-invocation: truep
allowed-tools: Bash(git *) Bash(gh *)
---

When pushing code, always follow these steps in order:

1. **Report the branch**: Tell the user what branch they are on and what branch you will push to.

2. **Review all changes for red flags**: Run `git diff HEAD` and `git status`. Look for hardcoded secrets, API keys, passwords, `.env` files being tracked, accidental debug code, or obvious broken logic. If you find anything suspicious, stop and list the concerns clearly — let the user decide before continuing.

3. **Write a commit summary**: Based on the diff, write a short and clear summary of what changed (3–6 bullets max). Show it to the user before committing.

4. **Commit and push**: Stage all changes with `git add -A`, commit using the summary as the message, then push to the remote branch. If the branch has no upstream yet, use `--set-upstream`.

5. **Offer a pull request**: Ask the user if they want to open a pull request, and if so, to which branch. If yes, create it using `gh pr create` with a title and body based on the commit summary.
W