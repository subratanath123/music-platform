#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# SurShongi (music-platform) — Multi-Environment Docker Buildx Bake Script
#
# Examples:
#   ./docker-build.sh --env prod --tag 0.1 --push
#   ./docker-build.sh --env qa   --tag 0.1 --load
#   ./docker-build.sh --env pps  --tag 0.2 --push --registry docker.io
# ==============================================================================

ENV_TARGET="prod"
TAG="${TAG:-0.1}"
REGISTRY="${REGISTRY:-}"
ACTION="--load"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|-e)
      ENV_TARGET="$2"
      shift 2
      ;;
    --tag|-t)
      TAG="$2"
      shift 2
      ;;
    --registry|-r)
      REGISTRY="$2"
      shift 2
      ;;
    --push)
      ACTION="--push"
      shift
      ;;
    --load)
      ACTION="--load"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./docker-build.sh [--env qa|pps|prod|all] [--tag 0.1] [--registry docker.io] [--push|--load]"
      exit 1
      ;;
  esac
done

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'local')"

export ENV_TARGET TAG REGISTRY GIT_SHA

echo "============================================================"
echo " Building target : ${ENV_TARGET}"
echo " Image namespace : ${REGISTRY:+${REGISTRY}/}${ENV_TARGET}/music-platform:${TAG}"
echo " Git revision    : ${GIT_SHA}"
echo " Action          : ${ACTION}"
echo "============================================================"

docker buildx bake \
  --file docker-bake.hcl \
  "${ACTION}" \
  "${ENV_TARGET}"
