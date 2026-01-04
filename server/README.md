# Dominion Gateway

LLM Gateway service that provides a unified API for LLM completions with authentication, rate limiting, and usage tracking.

## Features

- **Unified API**: Single endpoint for OpenAI and Anthropic models
- **API Key Authentication**: Secure hashed key storage with argon2
- **Rate Limiting**: Per-user and per-IP rate limits
- **Quota Management**: Daily request/token limits, monthly spend caps
- **Usage Tracking**: Full audit log with cost estimation
- **Admin API**: User and key management endpoints

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Copy environment file
cp env.example .env

# Edit .env with your API keys
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# ADMIN_TOKEN=your-secure-admin-token

# Start with SQLite (simple)
docker-compose -f ../docker-compose.sqlite.yml up -d

# Or with PostgreSQL (production)
docker-compose up -d
```

### Option 2: Local Development

```bash
# Install dependencies
npm install

# Copy environment file
cp env.example .env
# Edit .env with your settings

# Run in development mode
npm run dev

# Or build and run
npm run build
npm start
```

## Configuration

Set these environment variables in `.env`:

```bash
# Server
PORT=3100
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL=postgresql://...  # For PostgreSQL
# OR
SQLITE_PATH=./data/gateway.db  # For SQLite

# LLM Provider Keys (YOUR keys, kept secret)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Admin Token (for admin endpoints)
ADMIN_TOKEN=your-secure-admin-token-here

# Rate Limiting
RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW_MS=60000

# Default Quotas for new users
DEFAULT_DAILY_REQUESTS=1000
DEFAULT_DAILY_TOKENS=100000
DEFAULT_MONTHLY_SPEND_CAP_USD=50
```

## API Endpoints

### Health

```
GET /health         - Basic health check
GET /health/ready   - Readiness with DB + provider checks
```

### LLM Completions (requires API key)

```
POST /v1/llm/complete
Authorization: Bearer dom_xxxxx

{
  "provider": "openai" | "anthropic" | "auto",
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.2,
  "max_tokens": 1024
}
```

```
GET /v1/llm/models   - List available models
GET /v1/llm/quota    - Check remaining quota
```

### Admin (requires ADMIN_TOKEN)

```
POST /admin/users              - Create user
GET  /admin/users              - List users
GET  /admin/users/:id          - Get user details
POST /admin/users/:id/suspend  - Suspend user
POST /admin/users/:id/activate - Activate user

POST /admin/keys               - Create API key (returns plaintext ONCE)
DELETE /admin/keys/:id         - Revoke API key

POST /admin/limits             - Update user quotas
GET  /admin/usage?user_id=...  - Get usage stats
```

## Creating Users and API Keys

```bash
# Create a user
curl -X POST http://localhost:3100/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com"}'

# Response: {"id": "abc123", ...}

# Create an API key for the user
curl -X POST http://localhost:3100/admin/keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "abc123", "name": "My Key"}'

# Response: {"api_key": "dom_xxxxxx", "message": "Save this key now!"}
```

## Client Configuration

Users configure the CLI with their API key:

```bash
# Using the CLI
dominion-pm login

# Or set environment variables
export DOMINION_API_URL=http://localhost:3100
export DOMINION_API_TOKEN=dom_xxxxx

# Or add to pm.config.yaml
gateway:
  url: "http://localhost:3100"
  token: "dom_xxxxx"
```

## Security

- API keys are hashed with argon2 before storage
- Original keys are shown only once at creation
- Prompts are not logged by default (only redacted)
- Rate limiting prevents abuse
- Quota enforcement prevents cost overruns

## Development

```bash
# Run tests
npm test

# Run in watch mode
npm run test:watch

# Type check
npm run build
```

## License

MIT

