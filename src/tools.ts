import { Type } from '@sinclair/typebox';
import { createWallet, getBalance, getAddress, walletExists, COMMON_MINTS } from './wallet';
import { executeSwap, resolveTokenMint, getQuote } from './swap';
import * as path from 'path';

interface PluginConfig {
  rpcUrl?: string;
  walletPath?: string;
  autoCreateWallet?: boolean;
}

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
const DEFAULT_WALLET_PATH = '~/.openclaw/workspace/solana-wallet.json';

/**
 * Get plugin configuration with defaults
 */
function getConfig(): PluginConfig {
  // In a real plugin, this would come from OpenClaw's config system
  return {
    rpcUrl: process.env.SOLANA_RPC_URL || DEFAULT_RPC,
    walletPath: process.env.SOLANA_WALLET_PATH || DEFAULT_WALLET_PATH.replace('~', process.env.HOME || ''),
    autoCreateWallet: process.env.SOLANA_AUTO_CREATE === 'true',
  };
}

/**
 * Scan for trading opportunities
 */
async function scanOpportunities(chain: string = 'solana', maxResults: number = 5) {
  const opportunities = [];
  
  try {
    // DexScreener boosted tokens
    const boostedResponse = await fetch('https://api.dexscreener.com/token-boosts/latest/v1');
    const boostedData = await boostedResponse.json() as any;
    const solTokens = (boostedData || []).filter((t: any) => t.chainId === 'solana').slice(0, maxResults);
    
    for (const token of solTokens) {
      try {
        const tokenResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`);
        const tokenData = await tokenResponse.json() as any;
        
        if (tokenData.pairs && tokenData.pairs.length > 0) {
          const pair = tokenData.pairs[0];
          opportunities.push({
            mint: token.tokenAddress,
            symbol: pair.baseToken?.symbol || 'Unknown',
            priceUsd: parseFloat(pair.priceUsd || '0'),
            priceChange: {
              m5: pair.priceChange?.m5 || 0,
              h1: pair.priceChange?.h1 || 0,
              h6: pair.priceChange?.h6 || 0,
              h24: pair.priceChange?.h24 || 0,
            },
            volume24h: pair.volume?.h24 || 0,
            liquidity: pair.liquidity?.usd || 0,
            fdv: pair.fdv || 0,
            source: 'dexscreener-boosted',
            score: calculateOpportunityScore(pair),
          });
        }
      } catch (e) {
        console.warn(`Failed to fetch token data for ${token.tokenAddress}:`, e);
      }
    }
    
    // GeckoTerminal trending pools
    try {
      const trendingResponse = await fetch('https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?include=base_token');
      const trendingData = await trendingResponse.json() as any;
      
      for (const pool of (trendingData.data || []).slice(0, maxResults)) {
        const baseTokenId = pool.relationships?.base_token?.data?.id || '';
        const tokenAddr = baseTokenId.replace('solana_', '');
        
        if (tokenAddr && tokenAddr.length > 10) {
          const attr = pool.attributes;
          opportunities.push({
            mint: tokenAddr,
            symbol: attr.name?.split('/')[0] || 'Unknown',
            priceUsd: parseFloat(attr.base_token_price_usd || '0'),
            priceChange: {
              m5: attr.price_change_percentage?.m5 || 0,
              h1: attr.price_change_percentage?.h1 || 0,
              h6: attr.price_change_percentage?.h6 || 0,
              h24: attr.price_change_percentage?.h24 || 0,
            },
            volume24h: parseFloat(attr.volume_usd?.h24 || '0'),
            liquidity: parseFloat(attr.reserve_in_usd || '0'),
            fdv: 0, // Not available from GeckoTerminal
            source: 'geckoterminal-trending',
            score: calculateGeckoScore(attr),
          });
        }
      }
    } catch (e) {
      console.warn('Failed to fetch GeckoTerminal trending:', e);
    }
  } catch (e) {
    console.warn('Failed to scan opportunities:', e);
  }
  
  // Remove duplicates and sort by score
  const uniqueOpportunities = opportunities.filter((opp, index, self) =>
    index === self.findIndex(o => o.mint === opp.mint)
  );
  
  return uniqueOpportunities
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Calculate opportunity score based on multiple factors
 */
function calculateOpportunityScore(pair: any): number {
  let score = 0;
  
  const priceChange = pair.priceChange || {};
  const liquidity = pair.liquidity?.usd || 0;
  const volume24h = pair.volume?.h24 || 0;
  const fdv = pair.fdv || 0;
  const buys24h = pair.txns?.h24?.buys || 0;
  const sells24h = pair.txns?.h24?.sells || 0;
  
  // Early stage bonus (lower FDV = more upside)
  if (fdv > 0 && fdv < 500000) score += 30;
  else if (fdv < 2000000) score += 20;
  else if (fdv < 10000000) score += 10;
  
  // Momentum (rising price)
  if (priceChange.m5 > 0 && priceChange.m5 < 15) score += priceChange.m5 * 3;
  if (priceChange.h1 > 0 && priceChange.h1 < 30) score += priceChange.h1 * 2;
  if (priceChange.h1 > 5 && priceChange.m5 > 0) score += 15;
  
  // Volume/Liquidity ratio
  const volLiqRatio = volume24h / (liquidity || 1);
  if (volLiqRatio > 2) score += 20;
  if (volLiqRatio > 5) score += 15;
  
  // Buy pressure
  const buyRatio = buys24h / (sells24h || 1);
  if (buyRatio > 1.3) score += 15;
  if (buyRatio > 2) score += 10;
  
  // Penalties
  if (priceChange.m5 > 30) score -= 25; // Already pumped
  if (priceChange.h1 < -15) score -= 20; // Dumping
  if (priceChange.h24 < -40) score -= 20; // Dead
  if (liquidity < 15000) score -= 10; // Too thin
  if (buyRatio < 0.5) score -= 15; // Sell pressure
  
  return Math.max(0, score);
}

/**
 * Calculate score for GeckoTerminal data
 */
function calculateGeckoScore(attr: any): number {
  let score = 0;
  
  const priceChange = attr.price_change_percentage || {};
  const liquidity = parseFloat(attr.reserve_in_usd || '0');
  const volume24h = parseFloat(attr.volume_usd?.h24 || '0');
  
  // Momentum
  if (priceChange.h1 > 0 && priceChange.h1 < 30) score += priceChange.h1 * 2;
  if (priceChange.h6 > 0 && priceChange.h6 < 50) score += priceChange.h6;
  
  // Volume/Liquidity
  const volLiqRatio = volume24h / (liquidity || 1);
  if (volLiqRatio > 2) score += 20;
  
  // Base score for trending
  score += 10;
  
  // Penalties
  if (priceChange.h1 < -15) score -= 20;
  if (liquidity < 15000) score -= 10;
  
  return Math.max(0, score);
}

/**
 * Register Solana wallet tools with OpenClaw
 */
export function registerSolanaTools() {
  const config = getConfig();
  
  return {
    solana_wallet: {
      description: 'Manage Solana wallet - create, check balance, get address',
      examples: [
        'Check my Solana wallet balance',
        'Create a new Solana wallet',
        'Get my Solana wallet address'
      ],
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('create'),
          Type.Literal('balance'),
          Type.Literal('address')
        ], { description: 'Action to perform' })
      }),
      handler: async ({ action }: { action: 'create' | 'balance' | 'address' }) => {
        const walletPath = config.walletPath!;
        
        switch (action) {
          case 'create': {
            const exists = await walletExists(walletPath);
            if (exists) {
              const address = await getAddress(walletPath);
              return { success: true, message: 'Wallet already exists', address };
            }
            
            const address = await createWallet(walletPath);
            return { 
              success: true, 
              message: 'Wallet created successfully', 
              address,
              note: 'Please fund this wallet with SOL to start trading'
            };
          }
          
          case 'address': {
            if (!(await walletExists(walletPath))) {
              if (config.autoCreateWallet) {
                const address = await createWallet(walletPath);
                return { success: true, address, created: true };
              }
              return { success: false, error: 'Wallet not found' };
            }
            
            const address = await getAddress(walletPath);
            return { success: true, address };
          }
          
          case 'balance': {
            if (!(await walletExists(walletPath))) {
              if (config.autoCreateWallet) {
                const address = await createWallet(walletPath);
                const walletInfo = await getBalance(config.rpcUrl!, address);
                return { success: true, ...walletInfo, created: true };
              }
              return { success: false, error: 'Wallet not found' };
            }
            
            const address = await getAddress(walletPath);
            const walletInfo = await getBalance(config.rpcUrl!, address);
            return { success: true, ...walletInfo };
          }
          
          default:
            return { success: false, error: 'Invalid action' };
        }
      }
    },
    
    solana_swap: {
      description: 'Execute a token swap on Solana via Jupiter',
      examples: [
        'Swap 10 USDC to SOL',
        'Buy $5 worth of SOL with USDC',
        'Exchange SOL for USDC'
      ],
      parameters: Type.Object({
        inputToken: Type.String({ description: 'Input token symbol or mint address (e.g., SOL, USDC)' }),
        outputToken: Type.String({ description: 'Output token symbol or mint address' }),
        amountUsd: Type.Number({ description: 'USD amount to swap' })
      }),
      handler: async ({ inputToken, outputToken, amountUsd }: { 
        inputToken: string; 
        outputToken: string; 
        amountUsd: number;
      }) => {
        const walletPath = config.walletPath!;
        
        if (!(await walletExists(walletPath))) {
          return { success: false, error: 'Wallet not found. Create wallet first.' };
        }
        
        try {
          // Resolve token symbols to mint addresses
          const inputMint = resolveTokenMint(inputToken);
          const outputMint = resolveTokenMint(outputToken);
          
          // For simplicity, we'll use a rough conversion
          // In production, you'd want to get current prices
          const inputDecimals = inputMint === COMMON_MINTS.SOL ? 9 : 6;
          const roughPrice = inputMint === COMMON_MINTS.SOL ? 100 : 1; // Rough SOL price
          const tokenAmount = amountUsd / roughPrice;
          const rawAmount = Math.floor(tokenAmount * Math.pow(10, inputDecimals));
          
          const result = await executeSwap(
            config.rpcUrl!,
            walletPath,
            inputMint,
            outputMint,
            rawAmount.toString(),
            `swap_${inputToken}_${outputToken}`
          );
          
          return { 
            success: true, 
            signature: result.signature,
            inputAmount: result.inputAmount,
            outputAmount: result.outputAmount,
            inputSymbol: result.inputSymbol,
            outputSymbol: result.outputSymbol,
            priceImpact: result.quote.priceImpactPct
          };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Swap failed'
          };
        }
      }
    },
    
    solana_scan: {
      description: 'Scan for Solana trading opportunities',
      examples: [
        'Scan for Solana trading opportunities',
        'Find trending tokens on Solana',
        'Look for tokens to trade'
      ],
      parameters: Type.Object({
        chain: Type.Optional(Type.String({ description: 'Blockchain to scan (default: solana)' })),
        maxResults: Type.Optional(Type.Number({ description: 'Maximum results to return (default: 5)' }))
      }),
      handler: async ({ chain = 'solana', maxResults = 5 }: { 
        chain?: string; 
        maxResults?: number;
      }) => {
        try {
          const opportunities = await scanOpportunities(chain, maxResults);
          return { 
            success: true, 
            opportunities,
            count: opportunities.length
          };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Scan failed'
          };
        }
      }
    }
  };
}