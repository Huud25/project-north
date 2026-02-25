# North Agent (Microsoft Agent Framework)

Este microserviço adiciona **Microsoft Agent Framework** ao projeto **North** como “hero technology”.
Ele atua como um **agente de governança** que sempre chama a tool `evaluate_north()` para obter a decisão determinística do motor North (Azure Functions) e depois gera uma explicação humana em PT-BR.

## Pré-requisitos
- Python 3.10+ (recomendado)
- Azure CLI logado (para AzureCliCredential):
  - `az login`
- O core TS (Azure Functions) rodando localmente em `http://localhost:7071`

## Setup
```bash
cd north-agent
python -m venv .venv
# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env
# Edite o .env com seus valores (AZURE_OPENAI_ENDPOINT / deployment)