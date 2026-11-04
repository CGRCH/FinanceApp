/** Evita sobrescribir ediciones locales con una recarga obsoleta tras guardar. */
export function shouldApplyReloadAfterSave(localRevision: number, savedRevision: number): boolean {
  return localRevision === savedRevision;
}
