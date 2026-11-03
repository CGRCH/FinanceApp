import {
  classifyDatabaseError,
  isMigrationComplete,
  shouldRebuildTransactionsTable,
  type MigrationState,
} from '../migrate';

describe('shouldRebuildTransactionsTable', () => {
  it('no reconstruye si ya está en schema v7', () => {
    const state: MigrationState = {
      schemaVersion: 7,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: true,
      transactionsHasIsPaid: true,
    };
    expect(shouldRebuildTransactionsTable(state)).toBe(false);
    expect(isMigrationComplete(state)).toBe(true);
  });

  it('schema v6 aún no está completo (falta v7)', () => {
    const state: MigrationState = {
      schemaVersion: 6,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: true,
      transactionsHasIsPaid: true,
    };
    expect(isMigrationComplete(state)).toBe(false);
  });

  it('schema v6 puede reconstruir transacciones si versión < SCHEMA_VERSION', () => {
    const state: MigrationState = {
      schemaVersion: 6,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: true,
      transactionsHasIsPaid: true,
    };
    expect(shouldRebuildTransactionsTable(state)).toBe(true);
  });

  it('schema v5 aún no está completo (falta v7)', () => {
    const state: MigrationState = {
      schemaVersion: 5,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: true,
      transactionsHasIsPaid: true,
    };
    expect(isMigrationComplete(state)).toBe(false);
  });

  it('schema v4 aún no está completo (migra a v7)', () => {
    const state: MigrationState = {
      schemaVersion: 4,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: true,
      transactionsHasIsPaid: true,
    };
    expect(isMigrationComplete(state)).toBe(false);
  });

  it('requiere v4 para migración completa desde v3', () => {
    const state: MigrationState = {
      schemaVersion: 3,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: true,
      transactionsHasIsPaid: false,
    };
    expect(shouldRebuildTransactionsTable(state)).toBe(true);
    expect(isMigrationComplete(state)).toBe(false);
  });

  it('reconstruye en v1 con tabla legacy', () => {
    const state: MigrationState = {
      schemaVersion: 1,
      hasTransactionsTable: true,
      hasTransactionsV2Table: false,
      transactionsHasDebtId: false,
      transactionsHasIsPaid: false,
    };
    expect(shouldRebuildTransactionsTable(state)).toBe(true);
  });

  it('termina migración a medias si existe transactions_v2', () => {
    const state: MigrationState = {
      schemaVersion: 1,
      hasTransactionsTable: true,
      hasTransactionsV2Table: true,
      transactionsHasDebtId: false,
      transactionsHasIsPaid: false,
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
