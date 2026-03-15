# LINKEDEYE — Architecture, Connectivity & Flow Guide

**FinSpot Technology Solutions** | AWS Account: 654697417727 | Region: ap-south-1 (Mumbai) | Date: 2026-03-12

---

## 1. Solution Overview

LinkedEye is a shared ITSM/monitoring platform on AWS with **EKS Hybrid Nodes**:
- **AWS (Cloud):** EKS control plane, EC2-A (Jenkins), EC2-B (Mgmt tools), ALB, NAT GW
- **On-Prem (Client Site):** 2 worker nodes per client (HA), FortiGate firewall, NFS server
- **Connection:** Public internet HTTPS 443 (NO VPN — hybrid nodes connect to EKS public API endpoint)

---

## 2. Architecture Diagram

```
                          INTERNET (Users / Admins)
                                   |
                     https://*.finspot.in
                                   |
                         GoDaddy DNS (CNAME)
                                   |
                                   v
            +---------------------------------------+
            |    ALB (Application Load Balancer)     |
            |    linkedeye-tools-alb                 |
            |    Internet-facing, Multi-AZ           |
            |    TLS 1.3 (ACM *.finspot.in)          |
            |    AZ1a + AZ1b                         |
            +---+-------+-------+-------+-------+---+
                |       |       |       |       |
    jenkins. argocd. harbor. keycloak. vault.  fs-le-*.
    finspot  finspot  finspot  finspot  finspot  finspot.in
       |       |       |       |       |       |
  =================================================================
    PUBLIC SUBNET (10.15.1.0/24 + 10.15.2.0/24)
  =================================================================
                |                         |
   +------------------+     +---------------------------+
   | EC2-A (Jenkins)  |     | EC2-B (Mgmt+ITSM)        |
   | m5.xlarge        |     | m5.2xlarge                |
   | 15.206.123.199   |     | 15.206.80.24              |
   | 10.15.1.248      |     | 10.15.1.199 (private)     |
   |                  |     |                           |
   | Jenkins  :8080   |     | Harbor    :5000/:8083      |
   |                  |     | ArgoCD    :8082            |
   |                  |     | Keycloak  :8081            |
   |                  |     | Vault     :8200            |
   |                  |     | PostgreSQL:5432            |
   |                  |     | ITSM      :80              |
   +------------------+     +---------------------------+
                                      |
              +---------------------------+
              | NAT Gateways (x2)         |
              | AZ1: 15.207.153.110 (EIP) |
              | AZ2: 43.204.194.63  (EIP) |
              | Private subnet → Internet |
              +---------------------------+
                           |
  =================================================================
    PRIVATE SUBNETS (EKS Control Plane ENIs)
  =================================================================
                           |
   +------------------------------------------------+
   |         EKS CONTROL PLANE (AWS Managed)         |
   |         linkedeye-finspot-k8s-cluster           |
   |         v1.31  ACTIVE                            |
   |                                                  |
   |  +----------+  +----------+                      |
   |  |API Server|  |API Server|                      |
   |  | (AZ 1a)  |  | (AZ 1b)  |                      |
   |  +----------+  +----------+                      |
   |  +----------+  +----------+                      |
   |  |  etcd    |  |  etcd    |                      |
   |  | (AZ 1a)  |  | (AZ 1b)  |                      |
   |  +----------+  +----------+                      |
   |                                                  |
   |  ENIs: 10.15.10.0/24 (1a), 10.15.11.0/24 (1b)  |
   |  Addons: vpc-cni, coredns, kube-proxy, ebs-csi  |
   |  HA: 99.95% SLA, multi-AZ                       |
   +------------------------+-------------------------+
                           |
                  PUBLIC INTERNET (HTTPS 443)
                  NO VPN — Outbound only from on-prem
                           |
  =================================================================
    ON-PREM CLIENT SITE (via Internet)
  =================================================================
                           |
   +------------------------------------------------+
   |           ON-PREM (Client Site)                  |
   |                                                  |
   |   +-------------------+                          |
   |   | FortiGate Firewall|  <-- Outbound HTTPS only |
   |   +-------------------+                          |
   |           |                                      |
   |   +-------+--------+--------+                    |
   |   |                |        |                    |
   |   v                v        v                    |
   |   +-----------+ +-----------+ +-----------+     |
   |   | Worker    | | Worker    | | NFS       |     |
   |   | Node 1    | | Node 2    | | Server    |     |
   |   | (EKS      | | (EKS      | | (Shared   |     |
   |   |  Hybrid)  | |  Hybrid)  | |  Storage) |     |
   |   |           | |           | |           |     |
   |   | Pod A-1   | | Pod A-2   | |           |     |
   |   | Pod B-1   | | Pod B-2   | |           |     |
   |   +-----------+ +-----------+ +-----------+     |
   |                                                  |
   |   HA: 2 nodes, pods spread via anti-affinity     |
   |   PDB: minAvailable=1 (always 1 pod running)    |
   +--------------------------------------------------+
```

---

## 3. Network Architecture & Subnets

**VPC:** `10.15.0.0/16` (vpc-01d43b65392eb7364)

| Subnet | CIDR | AZ | Type | Purpose | ID |
|--------|------|----|------|---------|------|
| linkedeye-public-az1 | 10.15.1.0/24 | ap-south-1a | Public | EC2-A, EC2-B, NAT GW, ALB | subnet-0bdc4533ee62b2d3c |
| linkedeye-public-az2 | 10.15.2.0/24 | ap-south-1b | Public | ALB 2nd AZ | subnet-054e0299c17cd8792 |
| linkedeye-private-az1 | 10.15.10.0/24 | ap-south-1a | Private | EKS control plane ENIs | subnet-0f5887a9f7bd825d6 |
| linkedeye-private-az2 | 10.15.11.0/24 | ap-south-1b | Private | EKS control plane ENIs | subnet-05cd5f6bf97410bc5 |
| linkedeye-storage-az1 | 10.15.20.0/24 | ap-south-1a | Private | Storage | subnet-05bc39de32b347f04 |
| linkedeye-storage-az2 | 10.15.21.0/24 | ap-south-1b | Private | Storage | subnet-0fba24a417964ab69 |

---

## 4. All IP Addresses & Endpoints

### Public IPs (Internet-Facing)

| Resource | Public IP | Private IP | Purpose |
|----------|-----------|------------|---------|
| EC2-A (Jenkins) | **15.206.123.199** | 10.15.1.248 | Jenkins CI/CD, SSH access |
| EC2-B (Mgmt+ITSM) | **15.206.80.24** | 10.15.1.199 | Harbor, ArgoCD, Keycloak, Vault, ITSM, PostgreSQL |
| NAT Gateway AZ1 | **15.207.153.110** (EIP) | - | Private subnet outbound traffic |
| NAT Gateway AZ2 | **43.204.194.63** (EIP) | - | Private subnet outbound traffic |
| ALB | **linkedeye-tools-alb-922526253.ap-south-1.elb.amazonaws.com** | 65.2.133.69, 13.205.175.135 | HTTPS load balancing (*.finspot.in) |

### EKS Endpoint

| Resource | Endpoint | IPs | Access |
|----------|----------|-----|--------|
| EKS API | `https://11CBD16DDC759507469188FB0FCB690D.gr7.ap-south-1.eks.amazonaws.com` | 13.206.10.12, 13.205.107.216 | Public + Private |
| EKS Version | v1.31 | - | - |

---

## 5. Traffic Flows (Step-by-Step)

### Flow 1: User Accesses Tools (HTTPS)

```
User Browser → jenkins.finspot.in
  Step 1: DNS resolves → CNAME → ALB DNS
  Step 2: ALB receives on :443 (TLS 1.3)
  Step 3: ALB checks Host header → matches jenkins.finspot.in
  Step 4: ALB forwards to Target Group → EC2-A:8080
  Step 5: Jenkins responds → ALB → User
```

### Flow 2: CI/CD Pipeline (Build & Deploy)

```
Developer → Git Push
     |
     v
Jenkins (EC2-A:8080)
     |
     | 1. Build Docker Image
     | 2. Push to Harbor
     v
Harbor (EC2-B:5000)
     |
     | 3. Update K8s manifests in Git
     v
ArgoCD (EC2-B:8082)
     |
     | 4. Sync to EKS
     v
EKS Control Plane
     |
     | 5. Schedule pods (via public API over internet)
     v
On-Prem Worker-1 [Pod replica-1]
On-Prem Worker-2 [Pod replica-2]
```

### Flow 3: On-Prem Workers <-> EKS (NO VPN — Public Internet)

```
ON-PREM WORKER NODE (Client Site)
     |
     | ALL TRAFFIC IS OUTBOUND (HTTPS 443)
     | NO INBOUND PORTS NEEDED
     |
     +---> EKS API Server  : 443  (kubelet heartbeat, pod scheduling)
     |     13.206.10.12 / 13.205.107.216
     |     FQDN: 11CBD16DDC759507469188FB0FCB690D.gr7.ap-south-1.eks.amazonaws.com
     |
     +---> SSM Service     : 443  (node registration)
     |     ssm.ap-south-1.amazonaws.com
     |
     +---> SSM Messages    : 443  (remote management)
     |     ssmmessages.ap-south-1.amazonaws.com
     |
     +---> EC2 Messages    : 443  (instance messaging)
     |     ec2messages.ap-south-1.amazonaws.com
     |
     +---> STS (IAM)       : 443  (token refresh)
     |     sts.ap-south-1.amazonaws.com
     |
     +---> ECR API         : 443  (container registry API)
     |     api.ecr.ap-south-1.amazonaws.com
     |
     +---> ECR Docker      : 443  (image pulls)
     |     654697417727.dkr.ecr.ap-south-1.amazonaws.com
     |
     +---> S3              : 443  (ECR image layers)
     |     s3.ap-south-1.amazonaws.com
     |
     +---> Harbor          : 443  (private Docker registry)
     |     15.206.80.24 / harbor.finspot.in
     |
     +---> ALB (ITSM)      : 443  (ITSM portal)
           65.2.133.69 / 13.205.175.135
           linkedeye-tools-alb-922526253.ap-south-1.elb.amazonaws.com
```

### Flow 4: Outbound from Private Subnet

```
EKS Control Plane (private) → NAT GW (15.207.153.110 / 43.204.194.63) → IGW → Internet
```

### Flow 5: SSH Access (Admin)

```
EC2-A: ssh ubuntu@15.206.123.199 -i ~/.ssh/le-shared-k8s-key.pem
EC2-B: ssh ubuntu@15.206.80.24   -i ~/.ssh/le-shared-k8s-key.pem
(Direct SSH from office — public subnet, no bastion)
```

---

## 6. EKS HA Architecture

### Control Plane HA (AWS-Managed, Automatic)

| Component | HA Level | Details |
|-----------|----------|---------|
| API Server | 2+ replicas / 2 AZ | Load balanced, auto-healing |
| etcd | Multi-node / 2 AZ | Quorum-based, encrypted |
| CoreDNS | 2 replicas | Cluster DNS resolution |
| SLA | 99.95% | AWS managed uptime guarantee |

### Worker Node HA (2 Nodes per Client)

| Feature | Setting | What It Does |
|---------|---------|--------------|
| Replicas | 2 | 1 pod per worker node |
| Pod Anti-Affinity | preferredDuringScheduling | Spread pods across nodes |
| PodDisruptionBudget | minAvailable: 1 | Always 1 pod running during maintenance |
| Rolling Update | maxUnavailable: 1 | Update one at a time, zero downtime |
| Liveness Probe | HTTP /health | Auto-restart crashed pods |
| Readiness Probe | HTTP /ready | Remove unhealthy from service |
| Priority Class | le-critical (1M) | Critical pods never preempted |
| Network Policy | Namespace isolation | Pods only talk within namespace |

### Failure Scenarios

```
SCENARIO 1: Worker Node 1 goes down
  Before:  Worker-1 [Pod-A]       Worker-2 [Pod-B]
  After:   Worker-1 [DOWN]        Worker-2 [Pod-B, Pod-A]
  Result:  ZERO DOWNTIME — K8s reschedules to Worker-2

SCENARIO 2: Pod crashes
  Before:  Worker-1 [Pod-A CRASH] Worker-2 [Pod-B OK]
  After:   Worker-1 [Pod-A OK]    Worker-2 [Pod-B OK]
  Result:  ZERO DOWNTIME — Liveness probe restarts in ~30s

SCENARIO 3: Rolling deployment
  Step 1:  Worker-1 [v1->v2]      Worker-2 [v1]     (PDB: min 1)
  Step 2:  Worker-1 [v2]          Worker-2 [v1->v2]
  Result:  ZERO DOWNTIME — One pod always running

SCENARIO 4: Both workers down
  Result:  OUTAGE — EKS control plane still healthy
           Pods auto-reschedule when any node returns
```

---

## 7. ALB Host-Based Routing

| Domain | Target Group | Target | Port | Service |
|--------|-------------|--------|------|---------|
| le.jenkins.finspot.in | linkedeye-tg-jenkins | EC2-A | 8080 | Jenkins CI/CD |
| le.argocd.finspot.in | linkedeye-tg-argocd | EC2-B | 8082 | ArgoCD GitOps |
| le.harbor.finspot.in | linkedeye-tg-harbor | EC2-B | 8083 | Harbor Registry |
| le.keycloak.finspot.in | linkedeye-tg-keycloak | EC2-B | 8081 | Keycloak SSO |
| vault.finspot.in | linkedeye-tg-vault | EC2-B | 8200 | HashiCorp Vault |
| le.inc.finspot.in | linkedeye-tg-itsm | EC2-B | 80 | ITSM Platform |
| indmoney-prod-le.finspot.in | linkedeye-tg-client-itsm | EC2-B | 80 | Client ITSM |
| prod-le.plindia.com | linkedeye-tg-client-itsm | EC2-B | 80 | Client ITSM |
| prod-le.neo-wealth.com | linkedeye-tg-client-itsm | EC2-B | 80 | Client ITSM |
| prod-le.flattrade.in | linkedeye-tg-client-itsm | EC2-B | 80 | Client ITSM |

- **SSL:** ACM wildcard (*.finspot.in)
- **TLS Policy:** TLS 1.3
- **HTTP->HTTPS:** Port 80 redirects to 443

---

## 8. Security Controls

| Control | Implementation | Status |
|---------|---------------|--------|
| TLS 1.3 | ALB HTTPS with ACM SSL | Active |
| IMDSv2 Enforced | HttpTokens=required on all EC2s | Active |
| Pod Security Standards | le-workloads=restricted, le-monitoring=baseline | Active |
| RBAC | 4 ClusterRoles (argocd, jenkins, prometheus, client-admin) | Active |
| Network Policy | Namespace isolation for le-workloads | Active |
| EKS Secrets Encryption | KMS envelope encryption | Active |
| On-Prem Firewall | FortiGate (outbound HTTPS only) | On-Prem |

---

## 9. Network Team Requirements (For Siva)

### Connection Method: NO VPN — Public Internet HTTPS

Hybrid worker nodes connect to AWS via **public internet HTTPS 443**. No VPN tunnel, no inbound ports. FortiGate only needs **OUTBOUND** rules.

### What We Need from Siva

1. **On-prem worker node IPs** (or CIDR range) — to whitelist in AWS Security Groups
2. **FortiGate public IP** — to whitelist in AWS Security Groups (source IP for all on-prem traffic)
3. **Confirm outbound HTTPS 443 allowed** — workers must reach AWS public endpoints
4. **Worker node OS** — must be Ubuntu 22.04 for EKS Hybrid Nodes
5. **Worker node specs** — Min: 4 vCPU, 16 GB RAM, 100 GB disk per node

### Destination IPs to Allow (OUTBOUND ONLY from Worker Nodes)

| # | Service | Current IP(s) | FQDN (Recommended) | Port | Purpose |
|---|---------|---------------|---------------------|------|---------|
| 1 | EKS API Server | 13.206.10.12 | 11CBD16DDC759507469188FB0FCB690D.gr7.ap-south-1.eks.amazonaws.com | 443 | K8s API (kubelet heartbeat) |
| 2 | EKS API (failover) | 13.205.107.216 | (same FQDN, 2 IPs) | 443 | K8s API (failover) |
| 3 | SSM Service | 13.200.93.131 | ssm.ap-south-1.amazonaws.com | 443 | Node registration |
| 4 | SSM Messages | 13.200.95.122 | ssmmessages.ap-south-1.amazonaws.com | 443 | Remote management |
| 5 | EC2 Messages | 13.200.94.166 | ec2messages.ap-south-1.amazonaws.com | 443 | Instance messaging |
| 6 | STS (IAM) | 52.95.88.36 | sts.ap-south-1.amazonaws.com | 443 | Token refresh |
| 7 | ECR API | 13.234.9.96 | api.ecr.ap-south-1.amazonaws.com | 443 | Container registry API |
| 8 | ECR Docker | 13.232.222.26 | 654697417727.dkr.ecr.ap-south-1.amazonaws.com | 443 | Docker image pulls |
| 9 | S3 (ECR layers) | 16.12.36.69, 3.5.211.24 | s3.ap-south-1.amazonaws.com | 443 | Image layer storage |
| 10 | Harbor Registry | 15.206.80.24 (EIP-stable) | le.harbor.finspot.in | 443 | Private Docker registry |
| 11 | ALB (ITSM) | 65.2.133.69 | linkedeye-tools-alb-922526253.ap-south-1.elb.amazonaws.com | 443 | ITSM portal access |
| 12 | ALB (failover) | 13.205.175.135 | (same ALB FQDN) | 443 | ALB failover |

> **WARNING:** AWS IPs (rows 3-9) can change. Use FQDN-based rules if FortiGate supports it.

### FortiGate CLI Config — FQDN-Based (Recommended)

```
config firewall address
    edit "AWS-EKS-API-FQDN"
        set type fqdn
        set fqdn "11CBD16DDC759507469188FB0FCB690D.gr7.ap-south-1.eks.amazonaws.com"
        set comment "LinkedEye EKS API Server"
    next
    edit "AWS-SSM-FQDN"
        set type fqdn
        set fqdn "ssm.ap-south-1.amazonaws.com"
        set comment "AWS SSM Service"
    next
    edit "AWS-SSMMSG-FQDN"
        set type fqdn
        set fqdn "ssmmessages.ap-south-1.amazonaws.com"
        set comment "AWS SSM Messages"
    next
    edit "AWS-EC2MSG-FQDN"
        set type fqdn
        set fqdn "ec2messages.ap-south-1.amazonaws.com"
        set comment "AWS EC2 Messages"
    next
    edit "AWS-STS-FQDN"
        set type fqdn
        set fqdn "sts.ap-south-1.amazonaws.com"
        set comment "AWS STS (IAM Token Refresh)"
    next
    edit "AWS-ECR-FQDN"
        set type fqdn
        set fqdn "api.ecr.ap-south-1.amazonaws.com"
        set comment "AWS ECR API"
    next
    edit "AWS-ECR-DKR-FQDN"
        set type fqdn
        set fqdn "654697417727.dkr.ecr.ap-south-1.amazonaws.com"
        set comment "AWS ECR Docker Registry"
    next
    edit "AWS-S3-FQDN"
        set type fqdn
        set fqdn "s3.ap-south-1.amazonaws.com"
        set comment "AWS S3 (ECR layer storage)"
    next
    edit "LE-HARBOR"
        set subnet 15.206.80.24/32
        set comment "LinkedEye Harbor Registry (EIP - stable)"
    next
    edit "LE-ALB-FQDN"
        set type fqdn
        set fqdn "linkedeye-tools-alb-922526253.ap-south-1.elb.amazonaws.com"
        set comment "LinkedEye ALB"
    next
end

config firewall addrgrp
    edit "LinkedEye-AWS-Destinations"
        set member "AWS-EKS-API-FQDN" "AWS-SSM-FQDN" "AWS-SSMMSG-FQDN" "AWS-EC2MSG-FQDN" "AWS-STS-FQDN" "AWS-ECR-FQDN" "AWS-ECR-DKR-FQDN" "AWS-S3-FQDN" "LE-HARBOR" "LE-ALB-FQDN"
        set comment "All LinkedEye AWS destinations"
    next
end

config firewall policy
    edit 0
        set name "LinkedEye-Hybrid-Node-Outbound"
        set srcintf "internal"
        set dstintf "wan1"
        set srcaddr "LE-WORKER-NODE-1" "LE-WORKER-NODE-2"
        set dstaddr "LinkedEye-AWS-Destinations"
        set action accept
        set schedule "always"
        set service "HTTPS"
        set logtraffic all
        set comment "LinkedEye hybrid node to AWS - OUTBOUND ONLY"
    next
end
```

### FortiGate CLI Config — IP-Based (Fallback if FQDN not supported)

```
config firewall address
    edit "AWS-EKS-API-1"
        set subnet 13.206.10.12/32
        set comment "LinkedEye EKS API Server"
    next
    edit "AWS-EKS-API-2"
        set subnet 13.205.107.216/32
        set comment "LinkedEye EKS API Server (failover)"
    next
    edit "AWS-SSM"
        set subnet 13.200.93.131/32
        set comment "AWS SSM Service"
    next
    edit "AWS-SSM-MSG"
        set subnet 13.200.95.122/32
        set comment "AWS SSM Messages"
    next
    edit "AWS-EC2-MSG"
        set subnet 13.200.94.166/32
        set comment "AWS EC2 Messages"
    next
    edit "AWS-STS"
        set subnet 52.95.88.36/32
        set comment "AWS STS (IAM Token)"
    next
    edit "AWS-ECR-API"
        set subnet 13.234.9.96/32
        set comment "AWS ECR API"
    next
    edit "AWS-ECR-DOCKER"
        set subnet 13.232.222.26/32
        set comment "AWS ECR Docker Registry"
    next
    edit "AWS-S3-1"
        set subnet 16.12.36.69/32
        set comment "AWS S3 ap-south-1"
    next
    edit "AWS-S3-2"
        set subnet 3.5.211.24/32
        set comment "AWS S3 ap-south-1"
    next
    edit "LE-HARBOR"
        set subnet 15.206.80.24/32
        set comment "LinkedEye Harbor Registry"
    next
    edit "LE-ALB-1"
        set subnet 65.2.133.69/32
        set comment "LinkedEye ALB"
    next
    edit "LE-ALB-2"
        set subnet 13.205.175.135/32
        set comment "LinkedEye ALB (failover)"
    next
end

config firewall addrgrp
    edit "LinkedEye-AWS-Destinations"
        set member "AWS-EKS-API-1" "AWS-EKS-API-2" "AWS-SSM" "AWS-SSM-MSG" "AWS-EC2-MSG" "AWS-STS" "AWS-ECR-API" "AWS-ECR-DOCKER" "AWS-S3-1" "AWS-S3-2" "LE-HARBOR" "LE-ALB-1" "LE-ALB-2"
        set comment "All LinkedEye AWS destinations"
    next
end

config firewall policy
    edit 0
        set name "LinkedEye-Hybrid-Node-Outbound"
        set srcintf "internal"
        set dstintf "wan1"
        set srcaddr "LE-WORKER-NODE-1" "LE-WORKER-NODE-2"
        set dstaddr "LinkedEye-AWS-Destinations"
        set action accept
        set schedule "always"
        set service "HTTPS"
        set logtraffic all
        set comment "LinkedEye hybrid node to AWS - OUTBOUND ONLY"
    next
end
```

### Important Notes

| Item | Detail |
|------|--------|
| Direction | **OUTBOUND ONLY** — No inbound rules needed |
| Port | **443 (HTTPS) ONLY** — Single port for everything |
| Source | Worker node IPs (get from Siva per client site) |
| IP Warning | AWS IPs can change. Use FQDN-based rules if FortiGate supports it |

### Per-Client Worker Node IPs (Known)

| Client | Worker Node IPs | FortiGate Source Object |
|--------|----------------|------------------------|
| IndMoney (Mumbai) | 10.172.0.10 | LE-WORKER-NODE-1 |
| IndMoney (Bangalore) | 10.173.0.10 | LE-WORKER-NODE-2 |
| Neo Wealth | 10.40.1.10 | LE-WORKER-NODE-1 |
| DX | 10.10.10.110 | LE-WORKER-NODE-1 |
| Flattrade (FTC) | 202.87.54.194 | LE-WORKER-NODE-1 |
| IFSC | 10.40.40.23 | LE-WORKER-NODE-1 |
| DEV Servers | 172.16.0.65, 172.16.0.75 | LE-DEV-NODES |
| UAT Servers | 172.20.1.80, 172.20.1.90 | LE-UAT-NODES |

---

## 10. Client On-Prem Setup Guide

### Hardware Required (Per Client Site)

- **2x Worker Servers** (for HA) — Min: 4 vCPU, 16 GB RAM, 100 GB disk, Ubuntu 22.04
- **1x NFS Server** — Shared storage
- **Network** — Outbound HTTPS 443 to AWS endpoints (see Section 9)

### Node Registration Steps

```
Step 1: FortiGate outbound rules configured (Siva)
Step 2: Generate commands:  ./05-setup-hybrid-nodes.sh register <client-name>
Step 3: Run commands on both worker servers (SSM + nodeadm)
Step 4: Nodes appear as Ready in EKS cluster
Step 5: Label nodes:  kubectl label node <name> client=<client-name>
Step 6: Deploy workloads (2 replicas, HA auto-applied)
```

### Client Onboarding Flow

```
Step 1: Firewall Setup
  Siva configures FortiGate outbound HTTPS rules → Workers can reach AWS

Step 2: Register 2 Worker Nodes
  ./05-setup-hybrid-nodes.sh register acme-corp
  → Run output on Worker-1 and Worker-2

Step 3: Verify
  $ kubectl get nodes -l client=acme-corp
  NAME                STATUS   ROLES    VERSION
  acme-corp-worker-1  Ready    <none>   v1.31
  acme-corp-worker-2  Ready    <none>   v1.31

Step 4: Deploy Workloads (HA)
  $ kubectl apply -f acme-corp-deployment.yaml
  → 2 replicas (1 per node)
  → PDB ensures 1 always running
  → Anti-affinity spreads across nodes
```

---

## 11. Contacts

| Role | Name | Phone | Responsibility |
|------|------|-------|---------------|
| CTO / DevOps | Rajkumar Madhu | +91-917-677-2077 | Architecture, AWS, EKS, CI/CD |
| Ops Lead | Hoysala Bise | +91-998-014-6101 | Day-to-day operations |
| Network Lead | Siva Kadirannagari | +91-960-368-3828 | FortiGate, firewall rules, DNS |
| DBA | Rajkumar Ashokan | +91-975-189-2775 | PostgreSQL, database |

---

## Quick Summary

### What's Running

- VPC 10.15.0.0/16 + 6 Subnets + IGW + 2x NAT GW
- EC2-A (Jenkins) — m5.xlarge, 15.206.123.199
- EC2-B (Mgmt+ITSM) — m5.2xlarge, 15.206.80.24
- EKS v1.31 (linkedeye-finspot-k8s-cluster, HA control plane, 2 AZ)
- ALB (21 host routes, TLS 1.3)

### What's Pending

- FortiGate outbound rules — share Section 9 with Siva
- DNS CNAME — *.finspot.in → ALB
- Docker Compose — start services on EC2s
- Worker Nodes — register after FortiGate rules configured
- Client workload deployment

**Region:** ap-south-1 (Mumbai) | **EKS SLA:** 99.95%

---

*LinkedEye Infrastructure | FinSpot Technology Solutions | 2026-03-12 | Confidential*
