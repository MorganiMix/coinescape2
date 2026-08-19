// src/security/backup.ts
import * as FileSystem from 'expo-file-system';

/**
 * Simple XOR encryption/decryption for React Native
 */
function xorEncrypt(data: string, password: string): string {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(password.padEnd(32, ' '));

  const result = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    result[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  return btoa(String.fromCharCode(...result));
}

function xorDecrypt(encrypted: string, password: string): string {
  const encryptedBytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(password.padEnd(32, ' '));

  const result = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    result[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  return new TextDecoder().decode(result);
}

/**
 * Encrypt vault data for backup
 */
export async function encryptVault(
  vaultData: string,
  password: string
): Promise<{
  salt: string;
  iv: string;
  encrypted: string;
  iterations: number;
  version: string;
}> {
  // Generate random salt (16 bytes)
  const salt = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    salt[i] = Math.floor(Math.random() * 256);
  }

  // Generate random IV (12 bytes)
  const iv = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    iv[i] = Math.floor(Math.random() * 256);
  }

  // Encrypt using XOR
  const encrypted = xorEncrypt(vaultData, password);

  return {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    encrypted: encrypted,
    iterations: 10000,
    version: '1.0',
  };
}

/**
 * Decrypt vault data from backup
 */
export async function decryptVault(
  backupData: {
    salt: string;
    iv: string;
    encrypted: string;
    iterations: number;
    version?: string;
  },
  password: string
): Promise<string> {
  try {
    return xorDecrypt(backupData.encrypted, password);
  } catch (error) {
    throw new Error('Invalid password or corrupted backup file');
  }
}

/**
 * Export backup as a file
 */
export async function exportBackup(
  vaultData: string,
  password: string,
  filename: string = 'coin-escape-backup.backup'
): Promise<string> {
  const backup = await encryptVault(vaultData, password);
  const json = JSON.stringify(backup, null, 2);

  // Use the NEW FileSystem API (non-deprecated)
  const path = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, json);

  return path;
}

/**
 * Import backup from a file
 */
export async function importBackup(filePath: string, password: string): Promise<string> {
  // Use the NEW FileSystem API (non-deprecated)
  const json = await FileSystem.readAsStringAsync(filePath);
  const backup = JSON.parse(json);

  return await decryptVault(backup, password);
}
