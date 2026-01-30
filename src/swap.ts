import { Connection, VersionedTransaction, Keypair } from '@solana/web3.js';
import { loadWallet, COMMON_MINTS } from './wallet';

const JUPITER_LITE_API = 'https://lite-api.jup.ag';

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  inUsdValue?: string;
  outUsdValue?: string;
  router: string;
}

export interface SwapResult {
  signature: string;
  quote: SwapQuote;
  inputAmount: number;
  outputAmount: number;
  inputSymbol: string;
  outputSymbol: string;
}

/**
 * Get a swap quote from Jupiter
 */
export async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  taker: string
): Promise<SwapQuote> {
  const url = `${JUPITER_LITE_API}/ultra/v1/order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&taker=${taker}`;
  
  const response = await fetch(url);
  const data = await response.json() as any;
  
  if (data.errorCode || data.error) {
    throw new Error(data.errorMessage || data.error || JSON.stringify(data));
  }
  
  return {
    inputMint: data.inputMint,
    outputMint: data.outputMint,
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    priceImpactPct: parseFloat(data.priceImpactPct || '0'),
    inUsdValue: data.inUsdValue,
    outUsdValue: data.outUsdValue,
    router: data.router || 'jupiter',
  };
}

/**
 * Execute a swap via Jupiter
 */
export async function executeSwap(
  rpcUrl: string,
  walletPath: string,
  inputMint: string,
  outputMint: string,
  amount: string,
  label?: string
): Promise<SwapResult> {
  const connection = new Connection(rpcUrl);
  const wallet = await loadWallet(walletPath);
  const taker = wallet.publicKey.toBase58();
  
  // Get quote
  const quote = await getQuote(inputMint, outputMint, amount, taker);
  
  // Get transaction
  const orderResponse = await fetch(`${JUPITER_LITE_API}/ultra/v1/order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&taker=${taker}`);
  const orderData = await orderResponse.json() as any;
  
  if (orderData.errorCode || orderData.error) {
    throw new Error(orderData.errorMessage || orderData.error || JSON.stringify(orderData));
  }
  
  // Sign and send transaction
  const tx = VersionedTransaction.deserialize(Buffer.from(orderData.transaction, 'base64'));
  tx.sign([wallet]);
  const signedTransaction = Buffer.from(tx.serialize()).toString('base64');
  
  // Execute
  const executeResponse = await fetch(`${JUPITER_LITE_API}/ultra/v1/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signedTransaction,
      requestId: orderData.requestId,
    }),
  });
  
  const executeResult = await executeResponse.json() as any;
  
  if (executeResult.error) {
    throw new Error(executeResult.error);
  }
  
  // Calculate amounts for return
  const inputAmount = parseFloat(quote.inAmount);
  const outputAmount = parseFloat(quote.outAmount);
  
  return {
    signature: executeResult.signature,
    quote,
    inputAmount,
    outputAmount,
    inputSymbol: resolveTokenSymbol(inputMint),
    outputSymbol: resolveTokenSymbol(outputMint),
  };
}

/**
 * Resolve token mint to symbol
 */
export function resolveTokenMint(token: string): string {
  const upperToken = token.toUpperCase();
  
  switch (upperToken) {
    case 'SOL':
      return COMMON_MINTS.SOL;
    case 'USDC':
      return COMMON_MINTS.USDC;
    case 'USDT':
      return COMMON_MINTS.USDT;
    case 'RAY':
      return COMMON_MINTS.RAY;
    case 'SRM':
      return COMMON_MINTS.SRM;
    default:
      // Assume it's already a mint address if it's a long string
      return token.length > 20 ? token : token;
  }
}

/**
 * Resolve token mint to symbol (reverse lookup)
 */
export function resolveTokenSymbol(mint: string): string {
  for (const [symbol, mintAddress] of Object.entries(COMMON_MINTS)) {
    if (mintAddress === mint) {
      return symbol;
    }
  }
  return mint.slice(0, 8) + '...'; // Truncated mint address
}

/**
 * Calculate swap amount in raw units
 */
export function calculateSwapAmount(usdAmount: number, tokenPrice: number, decimals: number = 6): string {
  const tokenAmount = usdAmount / tokenPrice;
  const rawAmount = Math.floor(tokenAmount * Math.pow(10, decimals));
  return rawAmount.toString();
}