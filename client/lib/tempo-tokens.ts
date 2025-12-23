import { createPublicClient, http, formatUnits, type Address } from "viem";
import { defineChain } from "viem";

export const tempoTestnet = defineChain({
  id: 42429,
  name: "Tempo Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "ETH",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.tempo.xyz"],
    },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.testnet.tempo.xyz" },
  },
});

export interface TempoToken {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  color: string;
}

export const TEMPO_TOKENS: TempoToken[] = [
  {
    symbol: "pathUSD",
    name: "Path USD",
    address: "0x20c0000000000000000000000000000000000000",
    decimals: 6,
    color: "#8B5CF6",
  },
  {
    symbol: "AlphaUSD",
    name: "Alpha USD",
    address: "0x20c0000000000000000000000000000000000001",
    decimals: 6,
    color: "#0066FF",
  },
  {
    symbol: "BetaUSD",
    name: "Beta USD",
    address: "0x20c0000000000000000000000000000000000002",
    decimals: 6,
    color: "#10B981",
  },
  {
    symbol: "ThetaUSD",
    name: "Theta USD",
    address: "0x20c0000000000000000000000000000000000003",
    decimals: 6,
    color: "#F59E0B",
  },
];

export const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface TokenBalance {
  token: TempoToken;
  balance: string;
  balanceFormatted: string;
  balanceUsd: number;
}

export async function fetchTokenBalances(
  walletAddress: string
): Promise<TokenBalance[]> {
  const client = createPublicClient({
    chain: tempoTestnet,
    transport: http(),
  });

  const balances: TokenBalance[] = [];

  for (const token of TEMPO_TOKENS) {
    try {
      const balance = await client.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      });

      const formatted = formatUnits(balance, token.decimals);
      const balanceNum = parseFloat(formatted);

      balances.push({
        token,
        balance: balance.toString(),
        balanceFormatted: formatted,
        balanceUsd: balanceNum,
      });
    } catch (error) {
      console.error(`Failed to fetch ${token.symbol} balance:`, error);
      balances.push({
        token,
        balance: "0",
        balanceFormatted: "0",
        balanceUsd: 0,
      });
    }
  }

  return balances;
}

export function getTotalBalance(balances: TokenBalance[]): number {
  return balances.reduce((sum, b) => sum + b.balanceUsd, 0);
}
