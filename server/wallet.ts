import { 
  createWalletClient, 
  createPublicClient,
  http, 
  formatEther,
  parseEther,
  parseUnits,
  encodeFunctionData,
  type Chain,
  type Address
} from "viem";
import { 
  generateMnemonic, 
  mnemonicToAccount, 
  privateKeyToAccount,
  english
} from "viem/accounts";
import crypto from "crypto";

export const tempoTestnet: Chain = {
  id: 42429,
  name: "Tempo Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Tempo",
    symbol: "TEMPO",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.tempo.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Tempo Explorer",
      url: "https://explore.tempo.xyz",
    },
  },
};

export const publicClient = createPublicClient({
  chain: tempoTestnet,
  transport: http(),
});

export function generateWallet() {
  const mnemonic = generateMnemonic(english);
  const account = mnemonicToAccount(mnemonic);
  
  return {
    address: account.address,
    mnemonic,
  };
}

export function importWalletFromMnemonic(mnemonic: string) {
  try {
    const normalizedMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
    const words = normalizedMnemonic.split(" ");
    if (words.length !== 12 && words.length !== 24) {
      throw new Error("Invalid mnemonic: must be 12 or 24 words");
    }
    
    const account = mnemonicToAccount(normalizedMnemonic);
    return {
      address: account.address,
      mnemonic: normalizedMnemonic,
    };
  } catch (error) {
    throw new Error("Invalid recovery phrase");
  }
}

export function importWalletFromPrivateKey(privateKey: string) {
  try {
    let normalizedKey = privateKey.trim();
    if (!normalizedKey.startsWith("0x")) {
      normalizedKey = `0x${normalizedKey}`;
    }
    
    if (normalizedKey.length !== 66) {
      throw new Error("Invalid private key length");
    }
    
    const account = privateKeyToAccount(normalizedKey as `0x${string}`);
    return {
      address: account.address,
      privateKey: normalizedKey,
    };
  } catch (error) {
    throw new Error("Invalid private key");
  }
}

export async function getBalance(address: Address): Promise<string> {
  try {
    const balance = await publicClient.getBalance({ address });
    return formatEther(balance);
  } catch (error) {
    console.error("Error fetching balance:", error);
    return "0";
  }
}

function getEncryptionKey(): Buffer {
  const key = process.env.WALLET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("WALLET_ENCRYPTION_KEY environment variable is required for wallet security");
  }
  return Buffer.from(key, "hex").slice(0, 32);
}

const ALGORITHM = "aes-256-gcm";

export function encryptSensitiveData(data: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptSensitiveData(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
  
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = getEncryptionKey();
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export function createWalletClientForAccount(privateKeyOrMnemonic: string) {
  let account;
  
  if (privateKeyOrMnemonic.startsWith("0x")) {
    account = privateKeyToAccount(privateKeyOrMnemonic as `0x${string}`);
  } else {
    account = mnemonicToAccount(privateKeyOrMnemonic);
  }
  
  return createWalletClient({
    account,
    chain: tempoTestnet,
    transport: http(),
  });
}

const ERC20_TRANSFER_ABI = [
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

export interface TransferParams {
  tokenAddress: Address;
  toAddress: Address;
  amount: string;
  decimals: number;
}

export async function transferERC20Token(
  walletClient: ReturnType<typeof createWalletClientForAccount>,
  params: TransferParams
): Promise<string> {
  const { tokenAddress, toAddress, amount, decimals } = params;
  
  const amountInUnits = parseUnits(amount, decimals);
  
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [toAddress, amountInUnits],
  });
  
  const hash = await walletClient.sendTransaction({
    to: tokenAddress,
    data,
  });
  
  return hash;
}
