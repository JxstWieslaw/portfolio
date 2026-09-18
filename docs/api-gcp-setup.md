# API — one-time GCP, Neon and GitHub setup

Run once, by the owner, from a shell with `gcloud` and `gh` authenticated. Nothing here creates a
service-account key: GitHub Actions authenticates through Workload Identity Federation, restricted
to this repository's `main` branch.

## 0. Choose

```bash
PROJECT_ID=<your-gcp-project-id>
REGION=europe-west1          # pair with a nearby Neon region, e.g. AWS eu-central-1
REPO=JxstWieslaw/portfolio
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
```

## 1. APIs and the image registry

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  --project="$PROJECT_ID"
gcloud artifacts repositories create portfolio --repository-format=docker \
  --location="$REGION" --project="$PROJECT_ID"
```

## 2. Service accounts

```bash
gcloud iam service-accounts create portfolio-api-runtime --project="$PROJECT_ID" \
  --display-name="Portfolio API (Cloud Run runtime)"
gcloud iam service-accounts create portfolio-api-deployer --project="$PROJECT_ID" \
  --display-name="Portfolio API (GitHub deployer)"
RUNTIME_SA=portfolio-api-runtime@$PROJECT_ID.iam.gserviceaccount.com
DEPLOY_SA=portfolio-api-deployer@$PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" --role=roles/run.admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project="$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser
```

## 3. The database URL, in Secret Manager only

Create the Neon project (Postgres 17, a region near `$REGION`), then copy the **pooled** connection
string for the `main` branch.

```bash
printf '%s' '<neon-pooled-connection-string>' | \
  gcloud secrets create api-database-url --data-file=- --project="$PROJECT_ID"
for SA in "$RUNTIME_SA" "$DEPLOY_SA"; do
  gcloud secrets add-iam-policy-binding api-database-url --project="$PROJECT_ID" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done
```

## 4. Workload Identity Federation for GitHub Actions

```bash
gcloud iam workload-identity-pools create github --project="$PROJECT_ID" --location=global \
  --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc portfolio --project="$PROJECT_ID" \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

## 5. GitHub repository settings

```bash
gh variable set GCP_PROJECT_ID --body "$PROJECT_ID"
gh variable set GCP_REGION --body "$REGION"
gh variable set GCP_WIF_PROVIDER --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/portfolio"
gh variable set GCP_DEPLOY_SA --body "$DEPLOY_SA"
gh variable set GCP_RUNTIME_SA --body "$RUNTIME_SA"
gh variable set API_PUBLIC_BASE_URL --body "https://api.<domain>"      # the run.app URL until the domain exists
gh variable set API_CORS_ORIGINS --body "https://<domain>"
gh variable set API_CORS_PREVIEW_ORIGIN_PATTERN --body '^https://portfolio-[a-z0-9-]+-jxstwieslaw\.vercel\.app$'
# Neon branch per PR (optional; enables the api-neon-branch CI job)
gh variable set NEON_PROJECT_ID --body "<neon-project-id>"
gh secret set NEON_API_KEY
```

Create a GitHub environment named `production` (Settings → Environments); add required reviewers
there if deploys should wait for approval.

## 6. First deploy

`gh workflow run "Deploy API"`, then `gh run watch`. The smoke step prints `/v1/ready`.

## Domain (when chosen)

`gcloud beta run domain-mappings create --service=portfolio-api --domain=api.<domain> --region="$REGION"`,
add the DNS records it prints, then update `API_PUBLIC_BASE_URL`.
