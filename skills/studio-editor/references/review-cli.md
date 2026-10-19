# Review CLI refusals

Use the JSON `code` and process exit status together. Exit 0 acknowledges a
result; `list` returns the complete visible snapshot in `threads`, with each
thread's current `version`. Mutations return the current `thread`, original
`receipt` and `replayed`. On an identical retry the receipt can be older than the
current thread, so read current status and version from `thread`.

| Exit | Code | Action |
| --- | --- | --- |
| 0 | `ok` | Check the acknowledged result; `cleanupPending` means committed with cleanup pending. |
| 1 | `failed` | No successful acknowledgement; preserve the request for an identical retry if its outcome is unknown. |
| 2 | `invalid-args` | Correct command arguments using help. |
| 3 | `stale_version` | Re-list and re-read newer feedback before deciding again. |
| 4–5 | `not_found`, `forbidden` | Leave unresolved and report the missing thread or permission refusal. |
| 6–7 | `request_id_reused`, `wrong_review` | Stop this mutation; check the request data and course/review scope. |
| 8 | `invalid_input` | Explain the refused input; do not bypass admission. |
| 9–10 | `snapshot_changed`, `invalid_cursor` | Retry listing from the beginning; never act on a partial snapshot. |
| 11–17 | `text-file-missing`, `text-file-unreadable`, `invalid-utf8`, `empty-text`, `whitespace-only`, `text-too-large`, `lone-surrogate` | Correct the reply file before a new request; keep exact bytes for an unacknowledged retry. |
| 18 | `list-too-large` | Stop and report that the full queue could not be collected. |
| 19–25 | `corrupt-json`, `invalid-state`, `newer-schema`, `unsafe-path`, `read-only`, `disk-error`, `interrupted-write` | Stop and report the storage refusal; preserve review data. |
| 26 | `tracked-storage` | Stop; ask the person to remove private review storage from Git tracking using Studio's documented storage guidance. |
| 27 | `not-initialized` | No review yet means no comments; list normally returns exit 0 with `reviewId: null`, `changeSeq: 0` and `threads: []`. Mutations refuse this code. |
| 28 | `busy` | Retry shortly, at most three attempts; report continued contention. Preserve the same mutation request on retry. |
| 29 | `recovery-required` | Stop for course recovery. `detail.reason: "unfinished-init"` requires opening review-enabled Studio to finish initialization, then retrying. Never treat it as an empty queue. |
| 30 | `git-unavailable` | Stop; tell the person to make Git available for Studio's storage admission and retry. |
| 31 | `filesystem-unsupported` | Stop and report unsupported persistence guarantees. |
| 32–35 | `course-not-found`, `course-not-directory`, `course-manifest-missing`, `course-manifest-not-file` | Correct the course folder or regular `course.yaml`; never search another project for comments. |

Storage refusals do not authorize hand-editing the private review store. Keep
capabilities and ready URLs out of files and reports.
