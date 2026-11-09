# SurShongi (`music-platform`) — Kubernetes, Kustomize, Argo CD & Docker Bake Plan

> **Goal:** Deploy `music-platform` across any number of environments (`qa`, `pps`, `prod`) and multi-tenant contexts (`qa01, qa02, ..., qa0n`, `pps01..n`, `prod01..n`) using **Argo CD (`ApplicationSet`) + Kustomize**, **GCP Secret Manager** as the central `.env` vault (no per-context `ConfigMap` sprawl), and **Docker Buildx Bake** (`docker-bake.hcl` + `docker-build.sh`) for environment-scoped image namespaces (`qa/music-platform:0.1`, `pps/music-platform:0.1`, `prod/music-platform:0.1`).

---

## 1. End-to-End GitOps Architecture (With Argo CD)

Because **Argo CD** pulls from Git and syncs Kubernetes natively, **no `k8s-deploy.sh` script or `kubectl` step in GitHub Actions is needed**:

```
1. CI (GitHub Actions on PR merge to main/master):
   └── Runs ./docker-build.sh --env prod --tag 0.1 --push
       └── Builds & pushes prod/music-platform:0.1 (via docker-bake.hcl)

2. CD (Argo CD ApplicationSet inside GKE):
   └── Reads k8s/argocd/applicationset.yaml
       ├── Generates Argo CD Apps: music-platform-qa01, music-platform-qa02, music-platform-pps01, music-platform-prod01
       ├── Renders k8s/overlays/<tier> with Kustomize inline patches for:
       │     • ExternalSecret key: "music-platform-<context>" (in GCP Secret Manager)
       │     • Ingress host: "<context>.surshongi.com" / "surshongi.com"
       │     • Image: "<tier>/music-platform:<tag>"
       └── Syncs to GKE namespace "music-<context>"
```

---

## 2. Repository File Layout (Minimal & Non-Complicated)

Instead of creating separate folders or `ConfigMap` files for `qa01`, `qa02`, `qa03`, ..., `qa0n`, the entire setup is:

```text
├── Dockerfile                           # Multi-stage build running as non-root UID/GID 1001 (nextjs:nodejs)
├── docker-bake.hcl                      # Defines qa, pps, prod targets -> <tier>/music-platform:<TAG>
├── docker-build.sh                      # Standalone CLI & CI build/push script
├── .github/workflows/cicd.yml           # Auto builds & pushes prod/music-platform:<TAG> on main/master merge
└── k8s/
    ├── environments/                    # Git File Generator inputs (only touch these tiny JSON files!)
    │   ├── qa/
    │   │   ├── qa01.json                # { "tier": "qa", "context": "qa01", "host": "qa01.surshongi.com", "tag": "0.1" }
    │   │   └── qa02.json                # { "tier": "qa", "context": "qa02", "host": "qa02.surshongi.com", "tag": "0.1" }
    │   ├── pps/
    │   │   └── pps01.json               # { "tier": "pps", "context": "pps01", "host": "pps01.surshongi.com", "tag": "0.1" }
    │   └── prod/
    │       └── prod01.json              # { "tier": "prod", "context": "prod01", "host": "surshongi.com", "tag": "0.1" }
    ├── argocd/
    │   ├── qa-applicationset.yaml       # Applied ONCE to QA Argo CD (watches k8s/environments/qa/*.json)
    │   ├── pps-applicationset.yaml      # Applied ONCE to PPS Argo CD (watches k8s/environments/pps/*.json)
    │   └── prod-applicationset.yaml     # Applied ONCE to PROD Argo CD (watches k8s/environments/prod/*.json)
    ├── cluster/
    │   └── cluster-secret-store.yaml    # One-time per GKE cluster: connects External Secrets Operator to GCP Secret Manager
    ├── base/
    │   ├── kustomization.yaml
    │   ├── serviceaccount.yaml          # K8s ServiceAccount bound to GCP IAM via Workload Identity
    │   ├── externalsecret.yaml          # Pulls "music-platform-<context>" from GCP Secret Manager into K8s Secret
    │   ├── deployment.yaml              # Non-root pod, /api/health probes, envFrom: music-platform-env
    │   ├── service.yaml                 # ClusterIP Service (port 80 -> 3000)
    │   ├── ingress.yaml                 # NGINX Ingress (ingressClassName: nginx, 120m body size for audio/video uploads)
    │   └── hpa.yaml                     # HorizontalPodAutoscaler (CPU 70%, Memory 80%)
    └── overlays/
        ├── qa/kustomization.yaml        # Image: qa/music-platform, HPA: 1..3 replicas
        ├── pps/kustomization.yaml       # Image: pps/music-platform, HPA: 2..5 replicas
        └── prod/kustomization.yaml      # Image: prod/music-platform, HPA: 3..12 replicas, higher CPU/RAM
```

### How to add `qa03` or promote a release tag in the future:
- **Never edit the `ApplicationSet` YAML files again.**
- **To add a new context (`qa03`)**:
  1. Create secret `music-platform-qa03` in **GCP Secret Manager**.
  2. Drop a 6-line `k8s/environments/qa/qa03.json` file into Git:
     ```json
     {
       "tier": "qa",
       "context": "qa03",
       "host": "qa03.surshongi.com",
       "tag": "0.1"
     }
     ```
  The QA Argo CD automatically detects the new JSON file, creates namespace `music-qa03`, pulls `music-platform-qa03` from GCP Secret Manager, and deploys `qa/music-platform:0.1`.
- **To promote a new image tag (`0.2`) to `qa01` or `prod01`**:
  - Edit only `"tag": "0.2"` in `k8s/environments/qa/qa01.json` (or `k8s/environments/prod/prod01.json`).

---

## 3. Centralizing `.env` in GCP Secret Manager (No Per-Env ConfigMaps)

Rather than maintaining separate `ConfigMap` and `Secret` YAML files for `qa01`, `qa02`, `pps01`, `prod01`, we store each context's `.env` as a **single JSON secret in GCP Secret Manager**:

- `music-platform-qa01`
- `music-platform-qa02`
- `music-platform-pps01`
- `music-platform-prod01`

### Example JSON payload in GCP Secret Manager (`music-platform-prod01`)
```json
{
  "NEXT_PUBLIC_SITE_URL": "https://surshongi.com",
  "POSTGRES_USER": "surshongi",
  "POSTGRES_PASSWORD": "STRONG_PASS",
  "POSTGRES_DB": "surshongi_db",
  "DATABASE_URL": "postgresql://surshongi:STRONG_PASS@postgres:5432/surshongi_db",
  "GOOGLE_CLIENT_ID": "327079096228-xxxx.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET": "GOCSPX-xxxx",
  "SESSION_SECRET": "64-char-random-hex-secret",
  "SMTP_HOST": "smtp.gmail.com",
  "SMTP_PORT": "587",
  "SMTP_USER": "shuvra.dev9@gmail.com",
  "SMTP_PASS": "16-char-app-password"
}
```

### How it reaches the Pod automatically:
1. **External Secrets Operator (ESO)** runs in GKE and uses `k8s/cluster/cluster-secret-store.yaml`.
2. `k8s/base/externalsecret.yaml` (patched per context by `ApplicationSet` to `music-platform-{{.context}}`) unpacks every JSON key into a native Kubernetes `Secret` named `music-platform-env` inside namespace `music-<context>`.
3. `k8s/base/deployment.yaml` loads all keys into the container in one line:
   ```yaml
   envFrom:
     - secretRef:
         name: music-platform-env
   ```

---

## 4. Multi-Environment Image Namespaces (`docker-bake.hcl` & `docker-build.sh`)

We use **Docker Buildx Bake** (`docker-bake.hcl`) so image namespaces match each environment tier:
- **QA**: `qa/music-platform:0.1`
- **PPS**: `pps/music-platform:0.1`
- **PROD**: `prod/music-platform:0.1`

### Building locally or in CI with `docker-build.sh`
```bash
# Build & push prod image (used by GitHub Actions on merge to main/master)
./docker-build.sh --env prod --tag 0.1 --push

# Build & push qa image
./docker-build.sh --env qa --tag 0.1 --push

# Build & push pps image
./docker-build.sh --env pps --tag 0.1 --push
```

---

## 5. Which User Runs in Kubernetes? (3 Levels of Identity & Security)

1. **Linux OS User Inside the Container (`UID 1001 / nextjs`)**:
   - In `Dockerfile`, we create system group `nodejs (GID 1001)` and user `nextjs (UID 1001)`, `chown` `/app` and `/app/uploads` to `nextjs:nodejs`, and set `USER nextjs`.
   - In `k8s/base/deployment.yaml`, we enforce `runAsNonRoot: true`, `runAsUser: 1001`, `runAsGroup: 1001`, `fsGroup: 1001`, `allowPrivilegeEscalation: false`, and `capabilities.drop: ["ALL"]`.
2. **Kubernetes Pod Identity -> GCP IAM (`ServiceAccount` + Workload Identity)**:
   - The Pod runs under `music-platform-sa` (`k8s/base/serviceaccount.yaml`) with `automountServiceAccountToken: false`.
   - External Secrets Operator uses GKE Workload Identity (`roles/secretmanager.secretAccessor`) to read secrets from GCP Secret Manager without static JSON keys.
3. **Deployment Controller Identity (Argo CD)**:
   - Argo CD's `application-controller` ServiceAccount inside the cluster reconciles the namespaces (`music-qa01`, `music-prod01`) — so GitHub Actions does **not** need cluster admin credentials.

---

## 6. Logging & Observability: How to Observe Logs in GKE

1. **GKE Cloud Logging (Fluent Bit DaemonSet)**:
   - Every container's `stdout` / `stderr` is automatically collected by GKE and indexed in **Google Cloud Logging (Log Explorer)** with labels:
     ```text
     resource.type="k8s_container"
     resource.labels.namespace_name="music-prod01"
     resource.labels.container_name="music-platform"
     ```
2. **Argo CD UI Live Logs**:
   - In the **Argo CD Web UI**, click the `music-platform-prod01` (or `music-platform-qa01`) application -> click any Pod -> **Logs** tab to stream live container logs directly in the browser.
3. **CLI Live Tailing (`kubectl` / `stern`)**:
   ```bash
   kubectl logs -f -n music-prod01 -l app.kubernetes.io/name=music-platform --all-containers=true
   # Or with stern:
   stern -n music-prod01 -l app.kubernetes.io/name=music-platform
   ```
4. **Health & Autoscaling**:
   - Liveness & Readiness probes hit `GET /api/health` (`src/app/api/health/route.ts`).
   - `k8s/base/hpa.yaml` scales pods automatically based on CPU (`70%`) and Memory (`80%`).
