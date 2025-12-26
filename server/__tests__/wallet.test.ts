import {
  generateWallet,
  importWalletFromMnemonic,
  importWalletFromPrivateKey,
  encryptSensitiveData,
  decryptSensitiveData,
} from "../wallet";

describe("wallet utilities", () => {
  const originalEnv = process.env.WALLET_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.WALLET_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterAll(() => {
    process.env.WALLET_ENCRYPTION_KEY = originalEnv;
  });

  describe("generateWallet", () => {
    it("should generate a wallet with valid address and mnemonic", () => {
      const wallet = generateWallet();

      expect(wallet).toHaveProperty("address");
      expect(wallet).toHaveProperty("mnemonic");
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.mnemonic.split(" ").length).toBe(12);
    });

    it("should generate unique wallets each time", () => {
      const wallet1 = generateWallet();
      const wallet2 = generateWallet();

      expect(wallet1.address).not.toBe(wallet2.address);
      expect(wallet1.mnemonic).not.toBe(wallet2.mnemonic);
    });
  });

  describe("importWalletFromMnemonic", () => {
    it("should import wallet from valid 12-word mnemonic", () => {
      const testMnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const wallet = importWalletFromMnemonic(testMnemonic);

      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.mnemonic).toBe(testMnemonic);
    });

    it("should normalize mnemonic with extra whitespace", () => {
      const testMnemonic = "  abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ";
      const wallet = importWalletFromMnemonic(testMnemonic);

      expect(wallet.mnemonic).toBe(testMnemonic.trim().toLowerCase());
    });

    it("should throw error for invalid mnemonic word count", () => {
      expect(() => importWalletFromMnemonic("invalid mnemonic")).toThrow("Invalid recovery phrase");
    });

    it("should throw error for completely gibberish mnemonics", () => {
      expect(() => importWalletFromMnemonic("xyz123 notaword randomtext")).toThrow("Invalid recovery phrase");
    });
  });

  describe("importWalletFromPrivateKey", () => {
    it("should import wallet from valid private key with 0x prefix", () => {
      const testKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const wallet = importWalletFromPrivateKey(testKey);

      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.privateKey).toBe(testKey);
    });

    it("should import wallet from private key without 0x prefix", () => {
      const testKey = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const wallet = importWalletFromPrivateKey(testKey);

      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.privateKey).toBe(`0x${testKey}`);
    });

    it("should throw error for invalid private key length", () => {
      expect(() => importWalletFromPrivateKey("0xinvalid")).toThrow("Invalid private key");
    });

    it("should throw error for invalid private key characters", () => {
      expect(() => importWalletFromPrivateKey("0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toThrow("Invalid private key");
    });
  });

  describe("encryption/decryption", () => {
    it("should encrypt and decrypt data correctly", () => {
      const originalData = "this is a secret message";
      const encrypted = encryptSensitiveData(originalData);
      const decrypted = decryptSensitiveData(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it("should produce different ciphertext for same plaintext", () => {
      const data = "same message";
      const encrypted1 = encryptSensitiveData(data);
      const encrypted2 = encryptSensitiveData(data);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should handle special characters", () => {
      const specialData = "Test with special chars: !@#$%^&*()_+{}[]|\\:\";<>?,./~`";
      const encrypted = encryptSensitiveData(specialData);
      const decrypted = decryptSensitiveData(encrypted);

      expect(decrypted).toBe(specialData);
    });

    it("should handle unicode characters", () => {
      const unicodeData = "Unicode test: \u00e9\u00e8\u00ea \u00f1 \u00fc \u03b1\u03b2\u03b3 \u4e2d\u6587";
      const encrypted = encryptSensitiveData(unicodeData);
      const decrypted = decryptSensitiveData(encrypted);

      expect(decrypted).toBe(unicodeData);
    });

    it("should encrypt mnemonic phrases", () => {
      const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const encrypted = encryptSensitiveData(mnemonic);
      const decrypted = decryptSensitiveData(encrypted);

      expect(decrypted).toBe(mnemonic);
      expect(encrypted).not.toContain("abandon");
    });
  });
});
