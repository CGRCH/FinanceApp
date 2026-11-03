import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { BodyText, Card, SectionTitle } from '@/src/components/ui/Primitives';
import {
  moveTemplateItem,
  newFixedTemplateItemId,
  type FixedExpenseTemplate,
  type FixedTemplateItem,
} from '@/src/domain/fixedExpenseTemplate';
import {
  currentMonthFixedAmountForTemplateId,
  getFixedExpenseTemplate,
  saveFixedExpenseTemplate,
  syncFixedTemplateToOpenMonths,
} from '@/src/db/repository';
import { useFinance } from '@/src/context/FinanceContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';

export function FixedExpenseTemplateEditor() {
  const db = useSQLiteContext();
  const { refresh, refreshMonthIndex, notifyFixedTemplateChanged } = useFinance();
  const colors = useThemeColors();
  const [template, setTemplate] = useState<FixedExpenseTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setTemplate(await getFixedExpenseTemplate(db));
  }, [db]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (next: FixedExpenseTemplate) => {
      setSaving(true);
      try {
        await saveFixedExpenseTemplate(db, next);
        await syncFixedTemplateToOpenMonths(db, next);
        setTemplate(next);
        await refreshMonthIndex();
        await refresh();
        notifyFixedTemplateChanged();
      } finally {
        setSaving(false);
      }
    },
    [db, refresh, refreshMonthIndex, notifyFixedTemplateChanged],
  );

  const addItem = () => {
    if (!template) return;
    const item: FixedTemplateItem = { id: newFixedTemplateItemId(), name: 'Nuevo ítem' };
    void persist({ items: [...template.items, item] });
  };

  const renameItem = (index: number, name: string) => {
    if (!template) return;
    const items = [...template.items];
    items[index] = { ...items[index], name };
    setTemplate({ items });
  };

  const commitRename = async (index: number, name: string) => {
    if (!template) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Nombre vacío', 'Escribí un nombre para el ítem.');
      await load();
      return;
    }
    const items = [...template.items];
    items[index] = { ...items[index], name: trimmed };
    await persist({ items });
  };

  const removeItem = async (index: number) => {
    if (!template) return;
    const item = template.items[index];
    const amount = await currentMonthFixedAmountForTemplateId(db, item.id);
    const go = () => {
      const items = template.items.filter((_, i) => i !== index);
      void persist({ items });
    };
    if (amount > 0) {
      Alert.alert(
        'Eliminar ítem fijo',
        `En el mes actual "${item.name}" tiene monto cargado (${amount.toLocaleString('es-CL')} CLP). ¿Eliminarlo de la plantilla y de los meses abiertos?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: go },
        ],
      );
    } else {
      go();
    }
  };

  const moveUp = (index: number) => {
    if (!template || index <= 0) return;
    void persist(moveTemplateItem(template, index, index - 1));
  };

  const moveDown = (index: number) => {
    if (!template || index >= template.items.length - 1) return;
    void persist(moveTemplateItem(template, index, index + 1));
  };

  if (!template) {
    return (
      <Card>
        <BodyText muted>Cargando plantilla de gastos fijos…</BodyText>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Gastos fijos</SectionTitle>
      <BodyText muted>
        Lista de ítems que aparecen en la Planilla de cada mes (montos los cargás mes a mes). Los meses cerrados no
        cambian.
      </BodyText>
      {template.items.map((item, index) => (
        <View key={item.id} style={[styles.row, { borderColor: colors.border }]}>
          <TextInput
            value={item.name}
            onChangeText={(t) => renameItem(index, t)}
            onBlur={() => commitRename(index, item.name)}
            editable={!saving}
            style={[
              styles.nameInput,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
            ]}
            placeholder="Nombre"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.rowActions}>
            <Pressable
              disabled={saving || index === 0}
              onPress={() => moveUp(index)}
              style={[styles.iconBtn, { borderColor: colors.border, opacity: index === 0 ? 0.35 : 1 }]}>
              <Text style={{ color: colors.text }}>↑</Text>
            </Pressable>
            <Pressable
              disabled={saving || index === template.items.length - 1}
              onPress={() => moveDown(index)}
              style={[
                styles.iconBtn,
                { borderColor: colors.border, opacity: index === template.items.length - 1 ? 0.35 : 1 },
              ]}>
              <Text style={{ color: colors.text }}>↓</Text>
            </Pressable>
            <Pressable
              disabled={saving || template.items.length <= 1}
              onPress={() => removeItem(index)}
              style={[styles.iconBtn, { borderColor: colors.danger, opacity: template.items.length <= 1 ? 0.35 : 1 }]}>
              <Text style={{ color: colors.danger, fontWeight: '800' }}>✕</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable
        disabled={saving}
        onPress={addItem}
        style={[styles.addBtn, { borderColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
        <Text style={{ color: colors.primary, fontWeight: '800' }}>+ Agregar ítem fijo</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '600',
  },
  rowActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
});
