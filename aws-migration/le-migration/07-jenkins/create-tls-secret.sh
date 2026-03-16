#!/usr/bin/env bash
# ============================================================
# Create K8s TLS Secret from GoDaddy *.finspot.in certificate
# Run once before deploying Jenkins (and for each new namespace)
# ============================================================
set -euo pipefail

CERT_DIR="$(dirname "$0")/../finspot.in-2025"
CERT_FILE="${CERT_DIR}/3e487813d18d2877.crt"
BUNDLE_FILE="${CERT_DIR}/gd_bundle-g2.crt"
KEY_FILE="${CERT_DIR}/tls.key"
SECRET_NAME="finspot-tls"

echo "=========================================="
echo " Creating TLS Secret: ${SECRET_NAME}"
echo "=========================================="

# Verify cert files exist
for f in "${CERT_FILE}" "${BUNDLE_FILE}" "${KEY_FILE}"; do
  if [ ! -f "${f}" ]; then
    echo "ERROR: Missing file: ${f}"
    exit 1
  fi
done

# Build full-chain cert (cert + CA bundle)
FULLCHAIN=$(mktemp)
cat "${CERT_FILE}" "${BUNDLE_FILE}" > "${FULLCHAIN}"

echo "Certificate details:"
openssl x509 -in "${CERT_FILE}" -noout -subject -dates 2>&1

echo ""
echo "Creating TLS secret in namespaces..."

# Create secret in jenkins namespace
kubectl create secret tls ${SECRET_NAME} \
  --cert="${FULLCHAIN}" \
  --key="${KEY_FILE}" \
  --namespace=jenkins \
  --dry-run=client -o yaml | kubectl apply -f -

echo " ✓  jenkins/${SECRET_NAME}"

# Create in other tool namespaces too (for ArgoCD, Harbor, Keycloak)
for NS in argocd harbor keycloak vault; do
  if kubectl get namespace ${NS} &>/dev/null; then
    kubectl create secret tls ${SECRET_NAME} \
      --cert="${FULLCHAIN}" \
      --key="${KEY_FILE}" \
      --namespace=${NS} \
      --dry-run=client -o yaml | kubectl apply -f -
    echo " ✓  ${NS}/${SECRET_NAME}"
  fi
done

rm -f "${FULLCHAIN}"

echo ""
echo "Done! TLS secret '${SECRET_NAME}' created."
echo "Ingress reference:"
echo "  tls:"
echo "    - hosts:"
echo "        - le-jenkins.finspot.in"
echo "      secretName: ${SECRET_NAME}"
