import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface WalletInfo {
  address: string;
  solBalance: number;
  tokenBalances: TokenBalance[];
}

export interface TokenBalance {
  mint: string;
  symbol?: string;
  balance: number;
  decimals: number;
  uiAmount: number;
}

/**
 * Generate a new Solana keypair and save to file
 */
export async function createWallet(walletPath: string): Promise<string> {
  const keypair = Keypair.generate();
  const secretArray = Array.from(keypair.secretKey);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(walletPath), { recursive: true });
  
  // Save keypair as JSON array
  await fs.writeFile(walletPath, JSON.stringify(secretArray, null, 2));
  
  return keypair.publicKey.toBase58();
}

/**
 * Load keypair from JSON file
 */
export async function loadWallet(walletPath: string): Promise<Keypair> {
  try {
    const secretKeyString = await fs.readFile(walletPath, 'utf8');
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    throw new Error(`Failed to load wallet from ${walletPath}: ${error}`);
  }
}

/**
 * Get the public key address from wallet file
 */
export async function getAddress(walletPath: string): Promise<string> {
  const keypair = await loadWallet(walletPath);
  return keypair.publicKey.toBase58();
}

/**
 * Get SOL and token balances for a wallet
 */
export async function getBalance(rpcUrl: string, publicKeyStr: string): Promise<WalletInfo> {
  const connection = new Connection(rpcUrl);
  const publicKey = new PublicKey(publicKeyStr);
  
  // Get SOL balance
  const solBalanceLamports = await connection.getBalance(publicKey);
  const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;
  
  // Get token accounts
  const tokenBalances: TokenBalance[] = [];
  
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });
    
    for (const account of tokenAccounts.value) {
      const accountData = account.account.data.parsed.info;
      const mint = accountData.mint;
      const balance = parseInt(accountData.tokenAmount.amount);
      const decimals = accountData.tokenAmount.decimals;
      const uiAmount = accountData.tokenAmount.uiAmount || 0;
      
      // Only include accounts with balance > 0
      if (balance > 0) {
        tokenBalances.push({
          mint,
          balance,
          decimals,
          uiAmount,
        });
      }
    }
  } catch (error) {
    console.warn('Failed to fetch token balances:', error);
  }
  
  return {
    address: publicKeyStr,
    solBalance,
    tokenBalances,
  };
}

/**
 * Check if wallet file exists
 */
export async function walletExists(walletPath: string): Promise<boolean> {
  try {
    await fs.access(walletPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get common token mints
 */
export const COMMON_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  SRM: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
};