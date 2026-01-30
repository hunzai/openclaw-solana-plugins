# OpenClaw Solana Wallet Plugin

Add Solana wallet capabilities to any OpenClaw agent with autonomous trading features.

## Installation

```bash
openclaw plugins install @solana-clawd/solana-wallet
```

## Features

🪙 **Wallet Management**
- Create new Solana wallets
- Check SOL and token balances  
- Secure keypair storage

🔄 **Token Swapping**
- Jupiter aggregator integration
- Best price execution
- Support for major tokens (SOL, USDC, USDT, etc.)

📊 **Opportunity Scanning**  
- Multi-source token discovery
- Momentum-based scoring
- DexScreener & GeckoTerminal integration

🤖 **Autonomous Trading**
- Configurable trading monitor
- Risk management & stop losses
- Performance tracking

## Quick Start

### 1. Create Wallet
```typescript
await tools.solana_wallet({ action: "create" })
```

### 2. Check Balance
```typescript  
await tools.solana_wallet({ action: "balance" })
```

### 3. Execute Swap
```typescript
await tools.solana_swap({ 
  inputToken: "USDC", 
  outputToken: "SOL", 
  amountUsd: 10 
})
```

### 4. Scan Opportunities
```typescript
await tools.solana_scan({ maxResults: 5 })
```

## Configuration

Configure via plugin settings or environment variables:

```bash
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
export SOLANA_WALLET_PATH="~/.openclaw/workspace/solana-wallet.json"
export SOLANA_AUTO_CREATE="true"
```

## Trading Monitor

Run autonomous trading with the included monitor script:

```bash
# Manual execution
cd ~/.openclaw/workspace
node skills/solana-trader/scripts/monitor.js

# Automated via cron (every 15 minutes)
*/15 * * * * cd ~/.openclaw/workspace && node skills/solana-trader/scripts/monitor.js
```

### Trading Configuration
```bash
export POSITION_SIZE_USD=10          # Max $ per trade
export MAX_POSITIONS=4               # Max concurrent positions  
export MIN_SCORE=25                  # Minimum opportunity score
export TAKE_PROFIT_PCT=50            # Take profit at 50% gain
export STOP_LOSS_PCT=-25             # Stop loss at -25%
export TRAILING_STOP_PCT=15          # Trailing stop from peak
```

## Agent Tools

### `solana_wallet`
Manage wallet operations
- `action: "create"` - Generate new keypair
- `action: "balance"` - Check SOL + token balances
- `action: "address"` - Get wallet public key

### `solana_swap`  
Execute token swaps via Jupiter
- `inputToken: string` - Input token (SOL, USDC, mint address)
- `outputToken: string` - Output token  
- `amountUsd: number` - USD amount to swap

### `solana_scan`
Scan for trading opportunities
- `chain?: string` - Blockchain (default: solana)
- `maxResults?: number` - Max results (default: 5)

## CLI Commands

```bash
# Show wallet info
openclaw solana
```

## Trading Strategy

The monitor implements a **momentum-based strategy** targeting early-stage tokens:

**Entry Criteria:**
- Multi-source opportunity scanning (DexScreener, GeckoTerminal)
- Momentum scoring (price changes, volume, liquidity)
- Risk filters (minimum liquidity, maximum exposure)

**Exit Rules:**  
- Take profit: +50% gains
- Stop loss: -25% losses
- Trailing stop: 15% from peak
- Momentum death: Technical breakdown

**Risk Management:**
- Maximum 4 concurrent positions
- $3-10 position sizing
- Portfolio exposure limits
- Automated state tracking

## File Structure

```
openclaw-plugin-solana/
├── openclaw.plugin.json     # Plugin manifest
├── package.json             # npm package  
├── index.ts                 # Plugin entry point
├── src/
│   ├── wallet.ts            # Wallet operations
│   ├── swap.ts              # Jupiter integration
│   └── tools.ts             # Agent tool definitions
├── skills/
│   └── solana-trader/
│       ├── SKILL.md         # Trading skill guide
│       ├── scripts/
│       │   ├── monitor.js   # Trading monitor
│       │   └── scan.js      # Opportunity scanner
│       └── references/
│           └── strategy.md  # Strategy documentation
└── README.md
```

## Safety & Disclaimers

⚠️ **Trading cryptocurrencies involves substantial risk of loss.**

- Start with small amounts ($5-20 positions)
- Never risk more than you can afford to lose  
- Monitor performance before increasing position sizes
- Keep private keys secure and backed up
- This software is provided "as is" without warranty

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch  
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/solana-clawd/openclaw-plugin-solana)
- [OpenClaw Documentation](https://openclaw.com)
- [Solana Documentation](https://docs.solana.com)
- [Jupiter Documentation](https://docs.jup.ag)