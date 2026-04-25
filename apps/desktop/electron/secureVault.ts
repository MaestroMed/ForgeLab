import { ipcMain } from 'electron';

const SERVICE_PREFIX = 'forge-lab';

let keytarModule: typeof import('keytar') | null = null;
let keytarAvailable = false;

try {
  keytarModule = require('keytar');
  keytarAvailable = true;
} catch (e) {
  console.warn('[secureVault] keytar unavailable:', (e as Error).message);
}

function serviceFor(namespace: string): string {
  return `${SERVICE_PREFIX}:${namespace}`;
}

export async function setSecret(namespace: string, account: string, value: string): Promise<void> {
  if (!keytarModule) throw new Error('keytar not available');
  await keytarModule.setPassword(serviceFor(namespace), account, value);
}

export async function getSecret(namespace: string, account: string): Promise<string | null> {
  if (!keytarModule) return null;
  try { return await keytarModule.getPassword(serviceFor(namespace), account); } catch { return null; }
}

export async function deleteSecret(namespace: string, account: string): Promise<boolean> {
  if (!keytarModule) return false;
  try { return await keytarModule.deletePassword(serviceFor(namespace), account); } catch { return false; }
}

export async function listAccounts(namespace: string): Promise<Array<{ account: string }>> {
  if (!keytarModule) return [];
  try {
    const found = await keytarModule.findCredentials(serviceFor(namespace));
    return found.map(({ account }) => ({ account }));
  } catch {
    return [];
  }
}

export function isAvailable(): boolean { return keytarAvailable; }

export function registerSecureVaultIpc(): void {
  ipcMain.handle('vault:set', async (_e, { namespace, account, value }) =>
    setSecret(namespace, account, value),
  );
  ipcMain.handle('vault:get', async (_e, { namespace, account }) =>
    getSecret(namespace, account),
  );
  ipcMain.handle('vault:delete', async (_e, { namespace, account }) =>
    deleteSecret(namespace, account),
  );
  ipcMain.handle('vault:list', async (_e, { namespace }) => listAccounts(namespace));
  ipcMain.handle('vault:available', async () => isAvailable());
}
