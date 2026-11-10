#!/usr/bin/env bash
# Run once as a project administrator in Google Cloud Shell.
# No private keys are created; Codex keeps using workload identity federation.
set -euo pipefail
project=halfanonion
deployer="serviceAccount:codex-deployer@${project}.iam.gserviceaccount.com"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com --project="$project"
for account in onion-runtime onion-builder onion-scheduler; do
  email="${account}@${project}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$email" --project="$project" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$account" --project="$project"
  fi
  gcloud iam service-accounts add-iam-policy-binding "$email" --project="$project" --member="$deployer" --role=roles/iam.serviceAccountUser --condition=None
done
# Deployment authority for the requested service, durable state and cron jobs.
for role in roles/run.admin roles/storage.admin roles/secretmanager.admin roles/cloudscheduler.admin roles/artifactregistry.admin; do
  gcloud projects add-iam-policy-binding "$project" --member="$deployer" --role="$role" --condition=None >/dev/null
done
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:onion-builder@${project}.iam.gserviceaccount.com" --role=roles/cloudbuild.builds.builder --condition=None >/dev/null
echo 'Cloud Run deployment access is ready. Tell Codex to continue.'
