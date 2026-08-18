// src/security/backup.ts
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';

// Derive encryption key from password using PBKDF2
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
  
  return derivedKey;
}

// Encrypt vault data
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
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await deriveKey(password, salt);
  
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(vaultData);
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    dataBuffer
  );
  
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const encryptedBase64 = btoa(
    String.fromCharCode(...new Uint8Array(encryptedBuffer))
  );
  
  return {
    salt: saltBase64,
    iv: ivBase64,
    encrypted: encryptedBase64,
    iterations: 100000,
    version: '1.0',
  };
}

// Decrypt vault data
export async function decryptVault(
  backupData: {
    salt: string;
    iv: string;
    encrypted: string;
    iterations: number;
  },
  password: string
): Promise<string> {
  const salt = Uint8Array.from(atob(backupData.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(backupData.iv), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(backupData.encrypted), c => c.charCodeAt(0));
  
  const key = await deriveKey(password, salt);
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Export backup as file
export async function exportBackup(
  vaultData: string,
  password: string,
  filename: string = 'coin-escape-backup.backup'
): Promise<string> {
  const backup = await encryptVault(vaultData, password);
  const json = JSON.stringify(backup, null, 2);
  
  const path = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, json);
  
  return path;
}

// Import backup from file
export async function importBackup(
  filePath: string,
  password: string
): Promise<string> {
  const json = await FileSystem.readAsStringAsync(filePath);
  const backup = JSON.parse(json);
  
  return await decryptVault(backup, password);
}
