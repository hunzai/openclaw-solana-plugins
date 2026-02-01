import { registerSolanaTools } from './src/tools';
import { walletExists, createWallet, getAddress, getBalance } from './src/wallet';
import * as path from 'path';

const DEFAULT_WALLET_PATH = '~/.openclaw/workspace/solana-wallet.json';
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

/**
 * Plugin initialization function
 * Called when the plugin is loaded by OpenClaw
 */
export async function activate(openclaw: any) {
  console.log('🟣 Solana Wallet Plugin activating...');
  
  // Get plugin configuration
  const config = openclaw.config?.plugins?.['solana-wallet'] || {};
  const rpcUrl = config.rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const walletPath = (config.walletPath || process.env.SOLANA_WALLET_PATH || DEFAULT_WALLET_PATH)
    .replace('~', process.env.HOME || '');
  const autoCreateWallet = config.autoCreateWallet || process.env.SOLANA_AUTO_CREATE === 'true';
  
  // Check wallet status on load
  try {
    const exists = await walletExists(walletPath);
    
    if (!exists && autoCreateWallet) {
      console.log('📝 Creating new Solana wallet...');
      const address = await createWallet(walletPath);
      console.log(`✅ Wallet created: ${address}`);
      console.log(`💡 Fund this wallet with SOL to start trading: https://solscan.io/account/${address}`);
    } else if (exists) {
      const address = await getAddress(walletPath);
      console.log(`👛 Solana wallet loaded: ${address}`);
      
      // Optionally check balance on startup (but don't log errors)
      try {
        const walletInfo = await getBalance(rpcUrl, address);
        if (walletInfo.solBalance > 0) {
          console.log(`💰 SOL Balance: ${walletInfo.solBalance.toFixed(4)} SOL`);
        }
        if (walletInfo.tokenBalances.length > 0) {
          console.log(`🪙 Token accounts: ${walletInfo.tokenBalances.length}`);
        }
      } catch (e) {
        // Silent fail on balance check during startup
      }
    } else {
      console.log('⚠️  No Solana wallet found. Use "solana_wallet" tool with action="create" to generate one.');
    }
  } catch (error) {
    console.warn('Failed to initialize wallet:', error);
  }
  
  // Register agent tools
  const tools = registerSolanaTools();
  
  for (const tool of tools) {
    openclaw.registerTool(tool);
  }
  
  // Register CLI command
  openclaw.registerCommand('solana', {
    description: 'Show Solana wallet address and balance',
    handler: async () => {
      try {
        const exists = await walletExists(walletPath);
        
        if (!exists) {
          console.log('❌ No wallet found. Create one with:');
          console.log('   openclaw plugins install @solana-clawd/solana-wallet');
          console.log('   Then use the solana_wallet tool with action="create"');
          return;
        }
        
        const address = await getAddress(walletPath);
        console.log(`\n👛 Solana Wallet`);
        console.log(`Address: ${address}`);
        console.log(`Explorer: https://solscan.io/account/${address}`);
        
        try {
          const walletInfo = await getBalance(rpcUrl, address);
          console.log(`\n💰 Balances:`);
          console.log(`  SOL: ${walletInfo.solBalance.toFixed(4)}`);
          
          if (walletInfo.tokenBalances.length > 0) {
            console.log(`\n🪙 Token Balances:`);
            for (const token of walletInfo.tokenBalances) {
              const symbol = token.symbol || `${token.mint.slice(0, 8)}...`;
              console.log(`  ${symbol}: ${token.uiAmount}`);
            }
          }
        } catch (error) {
          console.warn('Failed to fetch balance:', error);
        }
        
      } catch (error) {
        console.error('Command failed:', error);
      }
    }
  });
  
  console.log('✅ Solana Wallet Plugin activated');
}

/**
 * Plugin deactivation function
 * Called when the plugin is unloaded
 */
export async function deactivate(openclaw: any) {
  console.log('🟣 Solana Wallet Plugin deactivating...');
  // Cleanup if needed
}

// Re-export for external usage
export * from './src/wallet';
export * from './src/swap';
export * from './src/tools';