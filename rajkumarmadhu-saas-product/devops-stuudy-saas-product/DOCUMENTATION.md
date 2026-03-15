# Santhira DevOps Platform Documentation

## Platform Overview

Santhira is a comprehensive DevOps Master Platform that provides AI-powered tools for DevOps teams, developers, and IT professionals. The platform includes 8 core modules designed to streamline DevOps workflows and improve productivity.

## Quick Start

### Prerequisites
- Python 3.12+
- PostgreSQL 16+ with pgvector extension
- Node.js (for optional frontend tools)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd santhira
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   cd backend && pip install -r requirements.txt
   cd ../dashboard && pip install -r requirements.txt
   ```

3. **Setup PostgreSQL:**
   ```sql
   -- Create database and enable pgvector
   CREATE DATABASE santhira;
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. **Run migrations (if any):**
   ```bash
   python backend/manage.py migrate
   ```

5. **Start services:**
   ```bash
   # Backend API
   cd backend
   uvicorn main:app --host 0.0.0.0 --port 8001
   
   # Frontend Dashboard
   cd ../dashboard
   streamlit run app.py --server.port 8501 --server.headless true
   ```

## Module Documentation

### 1. Learning Engine

**Purpose:** Structured DevOps learning paths and skill development

#### Features
- Interactive learning modules
- Progress tracking
- Certification preparation
- Hands-on labs and exercises

#### Usage
1. Navigate to Learning Engine from the main dashboard
2. Select a learning path based on your role:
   - Beginner: Fundamentals of DevOps
   - Intermediate: CI/CD and Automation
   - Advanced: Cloud Architecture and Security
3. Complete modules at your own pace
4. Track progress and earn certificates

#### Content Coverage
- DevOps fundamentals and culture
- Version control (Git)
- CI/CD pipelines (Jenkins, GitLab CI)
- Infrastructure as Code (Terraform, CloudFormation)
- Containerization (Docker, Kubernetes)
- Cloud platforms (AWS, Azure, GCP)
- Monitoring and logging (Prometheus, ELK)
- Security and compliance

---

### 2. Deployment Engine

**Purpose:** Automated deployment templates and pipeline management

#### Features
- Deployment templates for common scenarios
- Pipeline orchestration
- Environment management
- Rollback capabilities

#### Usage
1. Access Deployment Engine from the dashboard
2. Choose a deployment template:
   - Web application deployment
   - Microservices deployment
   - Database migration
   - Infrastructure provisioning
3. Configure deployment parameters
4. Execute deployment with one click
5. Monitor deployment status and logs

#### Supported Deployment Types
- **Web Applications:** Nginx, Apache, Node.js, Python apps
- **Microservices:** Docker Compose, Kubernetes manifests
- **Databases:** PostgreSQL, MySQL, MongoDB migrations
- **Infrastructure:** Terraform templates, CloudFormation stacks
- **CI/CD:** Jenkins pipelines, GitLab CI, GitHub Actions

---

### 3. Troubleshooter AI

**Purpose:** AI-powered error diagnosis and resolution

#### Features
- 10,000+ error catalog with semantic search
- 8-step troubleshooting pipeline
- Confidence scoring and recommendations
- Prevention strategies

#### Usage
1. Navigate to Troubleshooter AI module
2. Input error details:
   - Error message or log snippet
   - Technology stack information
   - Context about the issue
3. Click "Analyze Error"
4. Review AI-generated diagnosis:
   - Root cause analysis
   - Step-by-step fix
   - Confidence score
   - Prevention recommendations
5. Apply the suggested solution

#### Troubleshooting Pipeline
1. **Parse Error** - Extract key information from error message
2. **Classify Error** - Categorize by technology and severity
3. **Retrieve Knowledge** - Search error catalog and documentation
4. **Root Cause Analysis** - Identify underlying issues
5. **Generate Fix** - Create step-by-step resolution plan
6. **Prevention Strategy** - Suggest measures to avoid recurrence
7. **Confidence Scoring** - Rate solution reliability (0-100%)
8. **Implementation Guidance** - Provide detailed implementation steps

---

### 4. Interview Engine

**Purpose:** DevOps interview preparation and skill assessment

#### Features
- Question bank with 1,000+ DevOps questions
- Mock interview simulations
- Performance analytics
- Skill gap analysis

#### Usage
1. Access Interview Engine from the dashboard
2. Choose interview mode:
   - Practice Mode: Self-paced Q&A
   - Mock Interview: Timed simulation
   - Assessment: Skill evaluation
3. Select focus areas:
   - Core DevOps concepts
   - Cloud platforms
   - Containerization
   - CI/CD pipelines
   - Security and compliance
4. Complete interview and receive detailed feedback
5. Review performance analytics and improvement suggestions

#### Question Categories
- **Fundamentals:** DevOps principles, culture, and practices
- **Version Control:** Git workflows, branching strategies
- **CI/CD:** Pipeline design, automation tools
- **Infrastructure:** IaC, cloud architecture
- **Containers:** Docker, Kubernetes concepts
- **Monitoring:** Observability, logging, alerting
- **Security:** DevSecOps, compliance, vulnerability management
- **Networking:** DNS, load balancing, CDN
- **Databases:** Replication, backup, performance tuning

---

### 5. Log Analyzer

**Purpose:** Intelligent log parsing and anomaly detection

#### Features
- Real-time log analysis
- Anomaly detection
- Pattern recognition
- Alert correlation

#### Usage
1. Navigate to Log Analyzer module
2. Upload or stream log files:
   - Application logs
   - System logs
   - Security logs
   - Network logs
3. Configure analysis settings:
   - Time range
   - Log level filters
   - Pattern matching rules
4. Run analysis and view results:
   - Error patterns and trends
   - Performance bottlenecks
   - Security incidents
   - System anomalies
5. Generate reports and alerts

#### Analysis Capabilities
- **Error Detection:** Identify and categorize errors
- **Performance Analysis:** Find bottlenecks and slow operations
- **Security Monitoring:** Detect potential security incidents
- **Trend Analysis:** Identify recurring patterns and issues
- **Correlation:** Link related events across systems
- **Predictive Analytics:** Forecast potential issues based on patterns

---

### 6. 5-Point Expander

**Purpose:** Concept explanation and deep-dive generator

#### Features
- Five-point explanation framework
- Context-aware elaboration
- Visual aid generation
- Related concepts mapping

#### Usage
1. Access 5-Point Expander from the dashboard
2. Enter a DevOps concept or topic:
   - Example: "Kubernetes service discovery"
   - Example: "CI/CD best practices"
3. Click "Expand Concept"
4. Review the five-point explanation:
   - **Definition:** Clear, concise definition
   - **Purpose:** Why it matters in DevOps
   - **Components:** Key elements and architecture
   - **Implementation:** How to set it up
   - **Best Practices:** Tips and recommendations
5. Explore related concepts and visual aids

#### Example Output
For "Kubernetes Service Discovery":
1. **Definition:** Automatic detection of services and endpoints in Kubernetes clusters
2. **Purpose:** Enables microservices to find and communicate with each other
3. **Components:** Services, endpoints, DNS, kube-proxy
4. **Implementation:** Service definitions, selectors, load balancing
5. **Best Practices:** Headless services, external DNS, service mesh

---

### 7. Config Vault

**Purpose:** Configuration management for DevOps tools

#### Features
- Secure configuration storage
- Version control for configurations
- Environment-specific settings
- Template management

#### Usage
1. Navigate to Config Vault module
2. Browse configuration categories:
   - CI/CD configurations
   - Infrastructure templates
   - Security policies
   - Monitoring settings
3. View and manage configurations:
   - Search by technology or purpose
   - Compare different versions
   - Deploy to environments
4. Create new configurations:
   - Use templates or start from scratch
   - Add validation rules
   - Set permissions and access controls

#### Configuration Types
- **CI/CD:** Jenkins, GitLab CI, GitHub Actions files
- **Infrastructure:** Terraform, CloudFormation templates
- **Security:** IAM policies, security groups, firewall rules
- **Monitoring:** Prometheus configs, Grafana dashboards
- **Container:** Docker Compose, Kubernetes manifests
- **Network:** Load balancers, DNS configurations

---

### 8. Architecture Generator

**Purpose:** Infrastructure architecture templates and design

#### Features
- Architecture templates for common scenarios
- Cloud-agnostic designs
- Scalability patterns
- Cost optimization recommendations

#### Usage
1. Access Architecture Generator from the dashboard
2. Select architecture type:
   - Web application
   - Microservices
   - Data processing
   - Mobile backend
   - IoT platform
3. Configure requirements:
   - User load
   - Data volume
   - Performance needs
   - Budget constraints
4. Generate architecture:
   - Component diagram
   - Infrastructure as code
   - Deployment scripts
   - Cost estimates
5. Customize and export:
   - Modify components
   - Add security measures
   - Generate documentation

#### Architecture Patterns
- **Monolithic:** Traditional web applications
- **Microservices:** Distributed systems with service mesh
- **Serverless:** Event-driven architectures
- **Event-driven:** Message queues and streaming
- **Big Data:** Distributed processing and storage
- **Hybrid Cloud:** Multi-cloud and on-premise integration

## API Documentation

### Backend API Endpoints

#### Troubleshooter AI

**POST** `/api/troubleshoot/error`
- Analyze error and provide diagnosis
- Request: `{ "error_message": "string", "context": "string", "technology_stack": "string" }`
- Response: Troubleshooting analysis with confidence score

**GET** `/api/knowledge/search`
- Search error catalog and documentation
- Request: `{ "query": "string", "technology": "string", "limit": 10 }`
- Response: Search results with relevance scores

#### Learning Engine

**GET** `/api/learning/paths`
- Get available learning paths
- Response: List of learning paths with metadata

**GET** `/api/learning/modules/{path_id}`
- Get modules for a specific learning path
- Response: List of modules with content

#### Deployment Engine

**POST** `/api/deployment/execute`
- Execute deployment template
- Request: Deployment configuration
- Response: Deployment status and logs

---

## Troubleshooting

### Common Issues

#### Service Not Starting
1. Check port availability (8001 for backend, 8501 for frontend)
2. Verify PostgreSQL connection settings
3. Check Python dependencies installation

#### AI Services Not Working
1. Verify OpenAI/Anthropic API keys are configured
2. Check network connectivity for external services
3. Review backend logs for error details

#### Database Connection Issues
1. Ensure PostgreSQL is running
2. Verify pgvector extension is enabled
3. Check database credentials in configuration

### Debug Mode

Enable debug mode to get detailed logs:
```bash
# Backend
export DEBUG=true
uvicorn main:app --reload

# Frontend
streamlit run app.py --server.headless false --server.port 8501
```

### Logs Location
- Backend logs: `backend/logs/`
- Frontend logs: Streamlit console output
- Database logs: PostgreSQL server logs

## Support

For technical support and questions:
- Documentation: `docs/` directory
- Issues: GitHub Issues (if using)
- Community: Discord/Slack (if available)
- Email: support@santhira.com

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## About

Santhira is developed by Rajkumar Madhu (Founder & CTO) with contributions from the DevOps community. For more information, visit https://santhira.com.