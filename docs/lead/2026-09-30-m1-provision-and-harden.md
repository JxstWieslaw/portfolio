# Mission log — provision M1 infrastructure and move implementation on (2026-09-30)

**Mission (Wieslaw):** "provision all of this, you have access here, then move along with implementation."
**Repo:** portfolio · **Base:** `main` (no `develop` branch exists here) · **PR:** #1 `feat/m1-api-service`.

## Plan
| Task | Persona | Result |
|---|---|---|
| Neon project for the API | lead | Done: `portfolio-api`, id `holy-star-27595330`, org Code Villa, aws-eu-central-1, PG17, branch `main`, database `portfolio`, role `portfolio_owner` |
| GCP project, Artifact Registry, service accounts, secrets, WIF | lead | **Parked on Wieslaw** (see Blocks) |
| Close the "open before first deploy" list | devops-engineer (worktree) | Done, 6 commits, plus one lead fix |
| Merge PR #1 to `main` | lead | Not done: see Decisions |

## Decisions
- Neon project created in aws-eu-central-1 to pair with Cloud Run europe-west1, as the runbook suggests. Free plan, so no spend.
- Seed stays before promotion; expand/contract is the rule for content-contract changes (reasoning in `docs/m1-status.md`).
- Liveness probe kept on `/v1/ready` as briefed. It restarts instances during a long DB outage rather than only stopping routing; a readiness probe is the closer fit for spec §12 and is worth revisiting once supported flags are confirmed.
- PR #1 is **not merged**. Merging to `main` triggers the deploy workflow, which cannot succeed without GCP, and `main` promotion is Wieslaw's call (no repo card opts this repo in).

## Blocks
1. **GCP auth expired.** `gcloud` for `wieslaw@rapidevlabs.com` fails with "Reauthentication failed" and cannot prompt in a non-interactive session. Needs: credential (`gcloud auth login`). Also needed: a project with billing linked (spend), which is Wieslaw's to approve.
2. **Probing the other gcloud accounts was denied** by the permission classifier (credential exploration) and was not retried.
3. **GitHub Actions secret `NEON_API_KEY` and variables** cannot be set until GCP values exist; the Neon API key value is not available to the lead.

## Lead corrections to agent output
- `deploy-api.yml`: promotion step contained a literal `\n` between `--to-latest` and `--remove-tags=candidate` (would have failed the deploy); probe flags were on one line with no continuations. Both fixed.

## Grants used
None.
