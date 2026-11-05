import { deleteDatabaseAsync } from 'expo-sqlite';

const DATABASE_NAME = 'financeapp.db';

export async function resetLocalDatabase(): Promise<void> {
  try {
    await deleteDatabaseAsync(DATABASE_NAME);
  } catch {
    /* en web puede fallar si otro tab tiene el lock; el remount igual ayuda */
  }
}

export { DATABASE_NAME };
