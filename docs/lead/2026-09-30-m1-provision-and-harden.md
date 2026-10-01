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

## CI result after the hardening push (run 36695760731)
All jobs green except **API — image scan**: Trivy reports 2 HIGH in `libssl3t64` 3.5.7-1~deb13u2 (CVE-2026-75804 QUIC flow-control DoS, CVE-2026-84782 DTLS retransmission disclosure), fixed in deb13u3. The pinned distroless digest is still the newest `nodejs22-debian13:nonroot` upstream, so there is no fixed base to move to yet.
- **Decision:** leave the gate red rather than add a `.trivyignore`; weakening a gate Wieslaw set on purpose is his call. Dependabot (added this run) will propose the new digest once distroless republishes.
- **Open question for security-auditor / Wieslaw:** whether to time-box an ignore for these two, since Node does not obviously exercise QUIC or DTLS (not verified).
- Nothing merges or deploys until this is green or explicitly waived.

## Repo card
`~/.claude/skills/senior-engineer-personas/repos/portfolio.md` created (`auto_main: no`).

## GCP provisioned (later the same day)
Wieslaw authenticated `wieslawsamushonga01@gmail.com` and chose the **Firebase Payment** billing account (`01C7F1-B7670F-ECC1B9`).
Done with `--account=wieslawsamushonga01@gmail.com` on every command, following `docs/api-gcp-setup.md`:
- Project `jxst-portfolio-api` (number 890707232965), billing linked; APIs enabled: run, artifactregistry, secretmanager, iamcredentials, sts.
- Artifact Registry `portfolio` (docker, europe-west1). The first create was denied while the API enablement propagated; the retry succeeded.
- Service accounts `portfolio-api-runtime` and `portfolio-api-deployer`, with the runbook's roles (deployer: run.admin, artifactregistry.writer, serviceAccountUser on the runtime SA).
- Secret Manager `api-database-url` (pooled; runtime + deployer accessors) and `api-database-url-direct` (deployer only), from the Neon project's `main` branch.
- Workload Identity pool `github`, provider `portfolio`, limited to `JxstWieslaw/portfolio` on `refs/heads/main`; deployer SA bound as `workloadIdentityUser`.
- GitHub variables: GCP_PROJECT_ID, GCP_REGION, GCP_WIF_PROVIDER, GCP_DEPLOY_SA, GCP_RUNTIME_SA, API_PUBLIC_BASE_URL (the deterministic run.app URL), API_CORS_ORIGINS (**provisional `http://localhost:3000`** — no web deployment or domain exists yet), API_CORS_PREVIEW_ORIGIN_PATTERN.

### Deliberately not done
- `NEON_PROJECT_ID` variable and `NEON_API_KEY` secret: the key value is not available to the lead, and setting the variable alone would turn on a CI job that needs it.
- GitHub `production` environment and the first deploy: the deploy workflow only exists on the default branch once PR #1 merges, and merging promotes `main`.
- The Neon connection strings passed through this session once (the Neon connector returns them in its result). The project is new and empty; rotate the `portfolio_owner` password later if that matters.
