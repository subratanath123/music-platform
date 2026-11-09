// Docker Buildx Bake configuration for multi-environment image namespaces:
//   qa   -> qa/music-platform:<TAG>
//   pps  -> pps/music-platform:<TAG>
//   prod -> prod/music-platform:<TAG>
//
// Usage examples:
//   TAG=0.1 docker buildx bake prod --push
//   TAG=0.1 docker buildx bake qa --load
//   REGISTRY="docker.io" TAG=0.1 docker buildx bake all --push

variable "REGISTRY" {
  // Leave empty for Docker Hub short form (e.g. prod/music-platform:0.1),
  // or set e.g. "docker.io" or "asia-south1-docker.pkg.dev/my-gcp-project"
  default = ""
}

variable "APP_NAME" {
  default = "music-platform"
}

variable "TAG" {
  default = "0.1"
}

variable "GIT_SHA" {
  default = "local"
}

function "image_repo" {
  params = [env_ns]
  result = REGISTRY != "" ? "${REGISTRY}/${env_ns}/${APP_NAME}" : "${env_ns}/${APP_NAME}"
}

group "default" {
  targets = ["prod"]
}

group "all" {
  targets = ["qa", "pps", "prod"]
}

target "_common" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.title"    = "SurShongi Music Platform"
    "org.opencontainers.image.Version"  = "${TAG}"
    "org.opencontainers.image.revision" = "${GIT_SHA}"
  }
}

target "qa" {
  inherits = ["_common"]
  tags = [
    "${image_repo("qa")}:${TAG}",
    "${image_repo("qa")}:latest",
  ]
}

target "pps" {
  inherits = ["_common"]
  tags = [
    "${image_repo("pps")}:${TAG}",
    "${image_repo("pps")}:latest",
  ]
}

target "prod" {
  inherits = ["_common"]
  tags = [
    "${image_repo("prod")}:${TAG}",
    "${image_repo("prod")}:latest",
  ]
}
