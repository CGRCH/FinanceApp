import { shouldApplyReloadAfterSave } from '../planillaAutosave';

describe('planillaAutosave', () => {
  it('shouldApplyReloadAfterSave solo cuando no hubo ediciones concurrentes', () => {
    expect(shouldApplyReloadAfterSave(3, 3)).toBe(true);
    expect(shouldApplyReloadAfterSave(4, 3)).toBe(false);
  });
});
