# Project North

Deterministic Risk Evaluation Engine for DevOps Change Governance

Project North is a cloud-native evaluation system that classifies infrastructure and deployment changes using a deterministic policy engine. It provides structured risk scoring, persistent audit logging, operational metrics, and an AI-assisted explanation layer.

The policy engine is the authoritative decision component.  
Language models are used exclusively for explanation and do not influence risk classification.

---

# 1. System Purpose

Project North demonstrates a governance-oriented architecture for evaluating DevOps change requests with:

- Deterministic risk computation
- Explicit scoring logic
- Structured classification output
- Persistent audit records
- Operational metrics
- Separation between decision and explanation

The system is deployed in Microsoft Azure and operates through HTTP-triggered Azure Functions.

---

# 2. Deterministic Evaluation Model

## 2.1 Input Normalization

The system supports multiple input shapes and aliases:

- `environment` or `env`
- `action` or `actionType`
- `blastRadius` as string (`low`, `medium`, `high`)
- `irreversible` boolean
- Agent wrapper format: `{ "change": { ... } }`

Inputs are normalized before evaluation to ensure consistent scoring.

---

## 2.2 Risk Computation

Risk is computed through explicit scoring logic defined in the policy configuration:

- Environment-based weight
- Action-based weight
- Blast radius weight
- Irreversibility penalty
- Optional governance-related penalties

The score is mapped into discrete levels:

- LOW
- MEDIUM
- HIGH
- CRITICAL

The scoring process is deterministic and reproducible for identical input and policy configuration.

---

## 2.3 Output Contract

Each evaluation returns structured output:

- `riskScore`
- `riskLevel`
- `decision`
- `confidence`
- `summary`
- `riskBreakdown`
- `policyVersion`
- `timestamp`

Given identical input and policy version, the decision outcome remains consistent.

---

# 3. Architecture

## 3.1 Evaluation Pipeline

```
Incoming HTTP Request
  → Input normalization
  → Deterministic scoring
  → Risk classification
  → Audit persistence (Azure Blob Storage)
  → Structured JSON response
```

### Architectural Characteristics

- Decision logic is deterministic
- No LLM dependency in scoring path
- Audit logging occurs after evaluation
- Audit failures do not invalidate the decision response
- The evaluation function is stateless per request

---

## 3.2 Explanation Layer (Python Agent)

```
Python Agent
  → Calls Azure Function endpoint
  → Receives deterministic decision payload
  → Sends context to Azure OpenAI
  → Generates natural-language explanation
  → Returns enriched response
```

The agent returns:

- `northDecision`
- `agentResponse`
- `llmError` (if applicable)

The explanation layer does not modify or override deterministic results.

---

# 4. Data Persistence

## 4.1 Audit Records

Each evaluation generates a persistent record containing:

- Original payload
- Normalized payload
- Computed score
- Risk classification
- Timestamp
- Policy version

Audit records are stored in Azure Blob Storage.

Audit persistence is implemented in a best-effort manner and does not block response delivery.

---

## 4.2 Metrics

The system exposes a metrics endpoint providing:

- Total evaluations
- Distribution by risk level
- Distribution by decision
- Policy version breakdown
- Timestamp of latest evaluation

Metrics are derived from evaluation activity and reflect current runtime state.

---

# 5. Cloud Deployment

Provisioned Azure resources include:

- Resource Group
- Azure Storage Account
- Azure Function App (Node 20, Functions v4, Linux)

Deployment is performed via Azure CLI.

The service runs as an HTTP-triggered Azure Function and is stateless by design.

---

# 6. Security Characteristics

Current implementation:

- Public HTTP endpoints
- No authentication or authorization layer
- No policy mutation endpoints
- Secrets excluded from repository

Security model properties:

- Deterministic scoring prevents AI-based decision manipulation
- LLM cannot alter authoritative outputs
- Evaluation logic does not execute dynamic code
- Policy configuration is static

---

# 7. Reliability and Behavior

System guarantees:

- Deterministic classification
- Reproducible risk scoring
- Explicit risk thresholds
- Persistent audit trace per evaluation

Failure behavior:

- Audit logging failure does not invalidate evaluation response
- LLM failure does not affect deterministic output

---

# 8. Limitations

Current constraints:

- Static policy configuration
- No authentication layer
- No rate limiting
- No distributed metrics persistence
- No CI/CD pipeline configured
- No policy simulation mode

The system serves as a governance reference architecture and demonstration of deterministic change evaluation.

---

# 9. Repository Structure

```
azure-functions/   Deterministic evaluation backend (TypeScript)
north-agent/       Python explanation agent
examples/          Sample payloads
docs/              Technical documentation
```

---

# 10. Core Architectural Principle

Decision authority is deterministic.

Explanation is non-authoritative.

The separation between scoring and explanation ensures:

- Reproducibility
- Governance traceability
- Transparent risk modeling
- Predictable operational behavior
