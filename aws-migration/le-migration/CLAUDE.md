
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repo deploys the **LinkedEye** shared ITSM/monitoring platform infrastructure on AWS for **FinSpot Technology Solutions** (account `654697417727`, region `ap-south-1`). Architecture:
- **EKS Hybrid Nodes** — AWS-managed control plane, on-prem workers per client site
- **EC2-A** (public subnet) — Jenkins CI/CD
- **EC2-B** (public subnet) — Harbor, ArgoCD, Keycloak, Vault, PostgreSQL, ITSM (all via Docker Compose)
- **No bastion** — EC2s in public subnet, SSH direct from office

## AWS CLI Location

AWS CLI v2 is installed at `~/bin/aws` (not `/usr/bin`). Always ensure PATH:
```bash
export PATH="$HOME/bin:$PATH"
```

## Environment Setup

Always source before running any script:
```bash
source .env.shared
```

State IDs (VPC, subnet, SG IDs) are persisted to `/tmp/le-network-ids.env` by each script. If missing after reboot, recover with:
```bash
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=tag:Project,Values=LinkedEye --query 'Vpcs[0].VpcId' --output text)
```

## Execution Order

```
Phase A — Network:   01-network/01 → 02 → 03 → 04* → 05 → 06
Phase A — IAM:       02-iam/01 → 02 → 03
Phase B — Compute:   04-compute/01 → 02 → 05 → 06
Phase C — EKS:       06-kubernetes/04 → 05 → 06 → 07(optional) → 08 → 11
Phase F — ALB:       05-loadbalancer/01 → 02
Phase E — Deploy:    SSH to EC2s → docker compose up
Phase V — Validate:  10-validation/01
Phase H — Cleanup:   11-cleanup/01
```

`*` Phase 1 Step 4 (VPN): skip until network team provides FortiGate public IP.

## Current Deployment State

| Resource | ID | Status |
|---|---|---|
| VPC (10.100.0.0/16) | `vpc-0b902465605d6c6d6` | Done |
| Public Subnet AZ1a | `subnet-074f1da66fc7166fb` (10.100.1.0/24) | Done |
| Public Subnet AZ1b | `subnet-0b0e89de77a4c35a1` (10.100.2.0/24) | Done |
| Private Subnet AZ1a | `subnet-065784ff2566bace7` (10.100.10.0/24) | Done |
| EKS Private AZ1b | `subnet-081fd4945c6460889` (10.100.11.0/24) | Done |
| EKS Private AZ1c | `subnet-0d7fda38d5e1b0566` (10.100.12.0/24) | Done |
| IGW | `igw-03f7860ecc90aafd4` | Done |
| NAT GW | `nat-06401f68c43ff9511` | Done |
| SSH Key | `~/.ssh/le-shared-k8s-key.pem` | Done |
| IAM Roles | — | Unblocked (next step) |
| EKS Subnet Tags | — | Pending (01-network/05) |
| Security Groups | — | Pending (01-network/06) |
| Jenkins EC2-A | — (public subnet, m5.xlarge) | Pending |
| Mgmt+ITSM EC2-B | — (public subnet, m5.2xlarge) | Pending |
| EKS Cluster | `le-shared-eks` (hybrid mode) | Pending |
| Hybrid Nodes | On-prem per client (16 clients, 2 nodes each) | Pending (no VPN — public API) |
| Client Namespaces | 15 prod + 3 non-prod | Script ready (06-kubernetes/11) |
| Client ALB Rules | 15 client FQDNs (fs-le-*.finspot.in) | Script ready (05-loadbalancer/02) |
| ALB (*.finspot.in) | — | Pending |
| Old kubeadm Master | `i-0254e6bd512f67dd9` | To be terminated |
| Old kubeadm Worker | `i-0e0662a64aa8cc8e6` | To be terminated |
| VPN | — | NOT NEEDED (hybrid nodes use public EKS API) |

## Architecture

```
VPC 10.100.0.0/16  (ap-south-1)
  Public 10.100.1.0/24 (AZ1a) — EC2-A Jenkins, EC2-B Mgmt+ITSM, NAT GW, ALB
  Public 10.100.2.0/24 (AZ1b) — ALB 2nd AZ
  Private 10.100.10.0/24 — (available, no bastion)
  Private 10.100.11.0/24 (AZ1b) — EKS control plane ENIs
  Private 10.100.12.0/24 (AZ1c) — EKS control plane ENIs

EKS: le-shared-eks (K8s 1.29, Hybrid Nodes)
  Control plane: AWS-managed (public+private endpoint)
  Workers: On-prem servers per client site (via VPN + SSM Hybrid Activation)
  Namespaces: le-monitoring, le-workloads
  Each client node labeled: client=<name>

EC2-A (public): Jenkins :8080
EC2-B (public): Harbor :5000/:8083, ArgoCD :8082, Keycloak :8081, Vault :8200, ITSM :80
```

## Key Configuration

- **AMI:** `ami-0f58b397bc5c1f2e8` (Ubuntu 22.04 LTS, ap-south-1)
- **EKS:** v1.29, Hybrid Nodes, public+private endpoint
- **SSH key:** `~/.ssh/le-shared-k8s-key.pem`
- **SSH to EC2s:** direct (public subnet), no bastion
- **Management tools:** Docker Compose on EC2-B
- **VPN:** Set `FORTIGATE_PUBLIC_IP` in `.env.shared` then run `01-network/04-create-vpn.sh`

## Hybrid Node Registration (per client)

```bash
# Generate registration commands for a client:
bash 06-kubernetes/05-setup-hybrid-nodes.sh register <client-name>
```

## Vault Secret Path Convention

```
secret/le-{client}-prod/*
```

## Alert Routing (StackStorm)

13 Alertmanager receivers → StackStorm `st2api:9101`. Alert state `le_code`: 0=Critical, 1=Warning, 2=OK, 4=Disabled, 5=Placeholder.

## Contacts

| Role | Name | Phone |
|---|---|---|
| CTO / DevOps | Rajkumar Madhu | +91-917-677-2077 |
| Ops Lead | Hoysala Bise | +91-998-014-6101 |
| Network Lead (VPN/FW) | Siva Kadirannagari | +91-960-368-3828 |
| DBA | Rajkumar Ashokan | +91-975-189-2775 |
