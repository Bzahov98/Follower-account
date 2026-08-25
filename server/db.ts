import fs from 'fs/promises';
import path from 'path';
import { Account, AccountHistory } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function initDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const accountsFile = path.join(DATA_DIR, 'accounts.json');
  try {
    await fs.access(accountsFile);
  } catch {
    await fs.writeFile(accountsFile, JSON.stringify([]));
  }
}

export async function getAccounts(): Promise<Account[]> {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'accounts.json'), 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
  await fs.writeFile(path.join(DATA_DIR, 'accounts.json'), JSON.stringify(accounts, null, 2));
}

export async function getAccountHistory(id: string): Promise<AccountHistory> {
  const file = path.join(DATA_DIR, `account_${id}_history.json`);
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { followers: {}, following: {} };
  }
}

export async function saveAccountHistory(id: string, history: AccountHistory): Promise<void> {
  await fs.writeFile(path.join(DATA_DIR, `account_${id}_history.json`), JSON.stringify(history, null, 2));
}
