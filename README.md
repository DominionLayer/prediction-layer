# Polymarket Prediction CLI (dominion-pm)

A production-grade CLI for Polymarket analysis, probability estimation, and strategy simulation.

**This is NOT financial advice. Use at your own risk.**

## Disclaimer

**IMPORTANT**: This software is for informational and educational purposes ONLY. It does NOT:
- Provide financial, investment, or trading advice
- Guarantee any profits or outcomes
- Execute trades automatically
- Promise accurate predictions

Run `dominion-pm help-disclaimer` for full legal notices.

## Features

- Discover and track Polymarket markets
- Estimate probabilities using LLM or baseline heuristics
- Calculate edge (model vs market probability)
- Simulate positions and expected value
- Generate JSON + Markdown reports

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/polymarket-prediction-cli.git
cd polymarket-prediction-cli

# Install dependencies (requires pnpm)
pnpm install

# Build the project
pnpm build

# Link for global usage
pnpm link --global
```

## Quick Start

### 1. Initialize

```bash
# Create config files and database
dominion-pm init
```

This creates:
- `pm.config.yaml` - Configuration file
- `.env.example` - Environment variables template
- `data/` - Database directory
- `reports/` - Reports directory
- `logs/` - Logs directory

### 2. Configure

```bash
# Copy environment template
cp .env.example .env

# Edit with your API keys (optional)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Validate Setup

```bash
dominion-pm doctor
```

### 4. Scan Markets

```bash
# Fetch active markets
dominion-pm scan

# With mock data (for testing)
dominion-pm scan --mock

# Search specific markets
dominion-pm scan --query "bitcoin"
```

### 5. Analyze a Market

```bash
# View market details
dominion-pm show <market_id>

# Run analysis with LLM estimator (requires API key)
dominion-pm analyze <market_id>

# Run analysis with baseline estimator (no API key needed)
dominion-pm analyze <market_id> --estimator baseline
```

### 6. Compare Markets

```bash
# Find top opportunities by edge
dominion-pm compare

# With filters
dominion-pm compare --min-liquidity 10000 --max-spread 0.05 --top 20
```

### 7. Simulate Positions

```bash
# Simulate a YES position
dominion-pm simulate <market_id> --position YES --size 10

# Simulate with custom parameters
dominion-pm simulate <market_id> --position NO --size 5 --fee 100
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `dominion-pm init` | Initialize config and database |
| `dominion-pm login` | Authenticate with Gateway |
| `dominion-pm whoami` | Show current user and quota |
| `dominion-pm scan` | Fetch active markets |
| `dominion-pm show <id>` | Display market details |
| `dominion-pm analyze <id>` | Run probability estimation |
| `dominion-pm compare` | Compare markets by edge |
| `dominion-pm simulate <id>` | Simulate positions |
| `dominion-pm report [run_id]` | Regenerate reports |
| `dominion-pm doctor` | Validate configuration |
| `dominion-pm exec <id>` | Generate trading intent (skeleton) |
| `dominion-pm help-disclaimer` | Display legal disclaimers |

## Provider Configuration

### Using Dominion Gateway (Recommended)

The Gateway provides centralized LLM access with authentication, rate limiting, and usage tracking. Users don't need their own OpenAI/Anthropic keys.

```bash
# Login to the gateway
dominion-pm login

# Check your quota
dominion-pm whoami
```

Or configure manually:
```yaml
# pm.config.yaml
gateway:
  url: "http://localhost:3100"  # Your gateway URL
  token: "dom_your_api_token"   # From administrator
```

```bash
export DOMINION_API_URL=http://localhost:3100
export DOMINION_API_TOKEN=dom_your_api_token
```

### Using OpenAI (Direct)

```yaml
# pm.config.yaml
provider:
  default: "openai"
  openai:
    model: "gpt-4-turbo-preview"
    temperature: 0.2
```

```bash
export OPENAI_API_KEY=sk-your-key
dominion-pm analyze <market_id>
```

### Using Anthropic (Direct)

```yaml
# pm.config.yaml
provider:
  default: "anthropic"
  anthropic:
    model: "claude-3-5-sonnet-20241022"
    temperature: 0.2
```

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
dominion-pm analyze <market_id>
```

### Using Stub (Offline Testing)

```yaml
# pm.config.yaml
provider:
  default: "stub"
```

No API key required. Provides deterministic responses for testing.

## Probability Estimation

### LLM Estimator

Uses OpenAI or Anthropic to analyze market context and estimate probability.

Output format:
```json
{
  "estimated_probability": 0.65,
  "confidence": 0.7,
  "key_factors": ["Factor 1", "Factor 2"],
  "assumptions": ["Assumption 1"],
  "failure_modes": ["Failure mode 1"]
}
```

### Baseline Estimator

Deterministic heuristics based on:
- Price momentum
- Liquidity levels
- Time to expiry
- Bid-ask spread

No LLM required - good for bulk analysis.

## Edge Calculation

```
edge = model_probability - market_probability
```

- Positive edge: Model thinks YES is undervalued
- Negative edge: Model thinks NO is undervalued
- Neutral: Edge within noise range (<2%)

Expected Value:
```
EV_YES = P(win) * profit - P(lose) * cost
```

## Simulation

Simulates binary outcome positions with:
- Entry price
- Position size
- Fee/slippage costs
- Confidence bands

Output includes:
- Expected value
- Best/worst case scenarios
- Break-even probability
- Kelly fraction

## Adding a New Estimator

1. Create a new file in `src/analysis/estimators/`:

```typescript
// my-estimator.ts
import type { Estimator, EstimationResult } from './base.js';
import type { MarketWithPrices } from '../../polymarket/types.js';

export class MyEstimator implements Estimator {
  readonly name = 'my-estimator';
  readonly type = 'baseline' as const; // or 'llm'

  async estimate(market: MarketWithPrices): Promise<EstimationResult> {
    // Your estimation logic here
    return {
      estimatedProbability: 0.5,
      confidence: 0.5,
      keyFactors: ['Factor 1'],
      assumptions: ['Assumption 1'],
      failureModes: ['Failure mode 1'],
      estimatorType: this.type,
    };
  }
}
```

2. Export from `src/analysis/estimators/index.ts`

3. Use in commands or create a new command option

## Configuration Reference

### pm.config.yaml

```yaml
general:
  name: "My Analysis"
  environment: "development"

provider:
  default: "stub"  # openai | anthropic | stub

polymarket:
  base_url: "https://clob.polymarket.com"
  gamma_url: "https://gamma-api.polymarket.com"
  poll_interval_sec: 60

scoring:
  min_liquidity: 1000
  min_volume: 100
  max_spread: 0.10

simulation:
  fee_bps: 100
  slippage_bps: 50
  confidence_band: 0.10

reporting:
  out_dir: "./reports"

database:
  path: "./data/polymarket.db"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DOMINION_API_URL` | Gateway URL (default: http://localhost:3100) |
| `DOMINION_API_TOKEN` | Gateway API token |
| `OPENAI_API_KEY` | OpenAI API key (direct mode) |
| `ANTHROPIC_API_KEY` | Anthropic API key (direct mode) |
| `LLM_PROVIDER` | Override default provider |
| `DATABASE_PATH` | Override database path |
| `LOG_LEVEL` | debug, info, warn, error |

## Project Structure

```
src/
  cli/                 # CLI entry point
  commands/            # Command implementations
  core/
    config/            # Configuration loading
    db/                # SQLite database
    logging/           # Structured logging
    providers/         # LLM providers (Gateway, OpenAI, Anthropic, Stub)
    reporting/         # Report generation
  polymarket/          # Polymarket client
  analysis/
    estimators/        # Probability estimators
    edge.ts            # Edge calculation
    prompts.ts         # LLM prompts
  simulation/          # EV simulation
server/                # LLM Gateway backend
  src/
    config/            # Server configuration
    db/                # Database (PostgreSQL/SQLite)
    middleware/        # Auth, rate limiting, quota
    routes/            # API endpoints
    services/          # LLM service
  tests/               # Server tests
tests/
  unit/                # Unit tests
  integration/         # Integration tests
```

## Gateway Deployment (For Administrators)

See [server/README.md](server/README.md) for full documentation.

### Quick Start

```bash
cd server

# Copy and edit environment
cp env.example .env
# Set OPENAI_API_KEY, ANTHROPIC_API_KEY, ADMIN_TOKEN

# Start with Docker
docker-compose -f ../docker-compose.sqlite.yml up -d

# Create a user
curl -X POST http://localhost:3100/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "User", "email": "user@example.com"}'

# Create an API key
curl -X POST http://localhost:3100/admin/keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "USER_ID_FROM_ABOVE"}'

# Give the dom_xxx key to the user
```

## Testing

```bash
# Run all tests
pnpm test

# Run with watch mode
pnpm test:watch

# Run specific test file
pnpm test tests/unit/estimators.test.ts
```

## Safety Features

- **Disclaimer on every command**: Reminder that this is not financial advice
- **No auto-trading**: `exec` command only generates intent JSON
- **Explicit approval required**: Trading intents require `--approve` flag
- **Confidence ratings**: All analyses include uncertainty estimates
- **Rate limiting**: Built-in rate limiting for API calls
- **No guaranteed language**: Never claims "sure wins" or "risk-free"

## License

MIT

## Contributing

Contributions welcome! Please read the disclaimers and understand this is for educational purposes only.

