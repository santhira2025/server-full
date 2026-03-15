#!/bin/bash
# ============================================
# Deploy WhatsApp AI Sales Agent to K8s
# Usage: ./k8s/deploy.sh
# ============================================

set -e

NAMESPACE="whatsapp-agent"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "  WhatsApp AI Sales Agent - K8s Deploy"
echo "=========================================="

# Step 1: Create namespace
echo "[1/5] Creating namespace..."
kubectl apply -f "$SCRIPT_DIR/namespace.yaml"

# Step 2: Deploy configs and secrets
echo "[2/5] Applying configs and secrets..."
kubectl apply -f "$SCRIPT_DIR/configmap.yaml"
kubectl apply -f "$SCRIPT_DIR/secrets.yaml"

# Step 3: Deploy PostgreSQL
echo "[3/5] Deploying PostgreSQL..."
kubectl apply -f "$SCRIPT_DIR/postgres.yaml"
echo "       Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n $NAMESPACE --timeout=120s

# Step 4: Deploy the app
echo "[4/5] Deploying WhatsApp Agent..."
kubectl apply -f "$SCRIPT_DIR/app.yaml"
kubectl apply -f "$SCRIPT_DIR/hpa.yaml"
echo "       Waiting for app to be ready..."
kubectl wait --for=condition=ready pod -l app=whatsapp-agent -n $NAMESPACE --timeout=120s

# Step 5: Verify
echo "[5/5] Verifying deployment..."
echo ""
kubectl get pods -n $NAMESPACE
echo ""
kubectl get svc -n $NAMESPACE
echo ""
kubectl get ingress -n $NAMESPACE

echo ""
echo "=========================================="
echo "  Deployment complete!"
echo "  Webhook URL: https://wa-agent.finspot.in/api/webhook"
echo "  Dashboard:   https://wa-agent.finspot.in/dashboard/"
echo "=========================================="
