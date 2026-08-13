# NOVA TANKS — Agent / Development Completion Policy

This repository treats `main` as the authoritative, playable NOVA TANKS state.

## Merge-to-main is part of completion

**Intended changes SHOULD be merged to `main`.** A task is not considered finished merely because code exists on a branch or because a pull request is open.

Normal completion flow:

1. Implement the requested change on a focused branch when appropriate.
2. Add or update regression coverage for behavior that can reasonably regress.
3. Run the relevant validation and repository CI.
4. Resolve conflicts, integration problems, or failed checks rather than abandoning the change on a branch.
5. Once the change is coherent, intended, and green, merge it to `main`.
6. Verify that `main` contains the change and that any production materialization/deployment path is correctly wired.

Do **not** leave a green, intended change sitting indefinitely in a draft/open PR simply for an extra confirmation step. If the user asked for the work to be done, successful integration into `main` is the default end state.

## Legitimate reasons not to merge

Do not merge only when there is a concrete blocker, such as:

- the user explicitly asked for a review-only/draft change or explicitly said not to merge;
- CI or required validation is failing;
- the change is known to be incomplete, unsafe, or materially incorrect;
- another concurrent change creates a real conflict that must first be reconciled;
- repository permissions or branch protection prevent the merge.

When blocked, make the blocker explicit and continue toward resolution where possible. Do not treat “waiting for approval” as a default blocker unless approval was actually requested by the user or required by repository policy.

## Concurrent work

Multiple NOVA tasks may be in flight at once. Before merging, re-check the current `main`, rebase/reconcile as needed, preserve already-shipped systems, and ensure the final result composes cleanly with other active work. The goal is a coherent mainline, not a collection of isolated feature branches.

## Stale branches and superseded PRs

A branch being ahead of an old merge base does not automatically mean it contains missing work. Before reviving stale branches, determine whether their intent was already superseded or carried forward by a later merged change. Prefer current integrated implementations over resurrecting obsolete ones.
