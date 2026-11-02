import {
  classifyDatabaseError,
  isMigrationComplete,
  shouldRebuildTransactionsTable,
  type MigrationState,
} from '../migrate';

describe('shouldRebuildTransactionsTable', () => {
  it('no reconstruye si ya está en schema v2', () => {
    const state: MigrationState = {
      schemaVersion: 2,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: true,
    };
    expect(shouldRebuildTransactionsTable(state)).toBe(false);
    expect(isMigrationComplete(state)).toBe(true);
  });

  it('reconstruye en v1 con tabla legacy', () => {
    const state: MigrationState = {
      schemaVersion: 1,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: false,
    };
    expect(shouldRebuildTransactionsTable(state)).toBe(true);
  });

  it('termina migración a medias si existe transactions_v2', () => {
    const state: MigrationState = {
      schemaVersion: 1,
      hasTransactionsTable: true,
      hasTransactionsV2Table: true,
      transactionsHasDebtId: false,
    };
    expect(shouldRebuildTransactionsTable(state)).toBe(true);
  });
});

describe('classifyDatabaseError', () => {
  it('detecta bloqueo OPFS / pestañas', () => {
    const info = classifyDatabaseError(new Error('database is locked by another connection'));
    expect(info.suggestOtherTabs).toBe(true);
    expect(info.title).toMatch(/uso/i);
  });

  it('sugiere reset en errores de esquema', () => {
    const info = classifyDatabaseError(new Error('no such column: debt_id'));
    expect(info.suggestReset).toBe(true);
  });
});
