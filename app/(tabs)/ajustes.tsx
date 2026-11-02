import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BodyText, Card, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { exportDemoWorkbook, pickAndParseWorkbook, scheduleShortfallReminder } from '@/src/services/importExport';
import { spacing } from '@/src/theme/tokens';

export default function AjustesScreen() {
  const { themePreference, setThemePreference, importFromParsed, projection, refresh } = useFinance();
  const colors = useThemeColors();

  const onImport = async () => {
    try {
      const parsed = await pickAndParseWorkbook();
      const result = await importFromParsed(parsed);
      Alert.alert('Listo', `Importamos ${result.transactions} movimientos y ${result.debts} deudas.`);
      await refresh();
    } catch (e) {
      Alert.alert('No se pudo importar', e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  const onExport = async () => {
    try {
      await exportDemoWorkbook();
    } catch (e) {
      Alert.alert('Exportación', e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  const onNotify = async () => {
    if (projection.willRunShort) {
      await scheduleShortfallReminder(
        `Ojo con el mes: proyección en rojo por ${projection.projectedShortfallClp.toLocaleString('es-CL')} CLP.`,
      );
      Alert.alert('Notificación programada', 'Te recordaremos mañana revisar tu proyección.');
    } else {
      Alert.alert('Todo tranqui', 'No hay alerta de faltante para programar.');
    }
  };

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Card>
        <SectionTitle>Apariencia</SectionTitle>
        <View style={styles.chips}>
          {(['system', 'light', 'dark'] as const).map((option) => {
            const selected = themePreference === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                onPress={() => setThemePreference(option)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}>
                <Text style={{ color: colors.text, fontWeight: selected ? '700' : '500' }}>
                  {option === 'system' ? 'Sistema' : option === 'light' ? 'Claro' : 'Oscuro'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle>Excel Gestión</SectionTitle>
        <BodyText muted>
          Importa tu archivo .xlsx (hoja Gestión + Deuda). Los datos quedan solo en este dispositivo.
        </BodyText>
        <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={onImport}>
          <Text style={styles.buttonText}>Importar .xlsx</Text>
        </Pressable>
        <Pressable style={[styles.buttonOutline, { borderColor: colors.border }]} onPress={onExport}>
          <Text style={[styles.buttonOutlineText, { color: colors.text }]}>Exportar plantilla</Text>
        </Pressable>
      </Card>

      <Card>
        <SectionTitle>Notificaciones locales</SectionTitle>
        <BodyText muted>Sin nube: avisos generados en tu teléfono según tu proyección.</BodyText>
        <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={onNotify}>
          <Text style={styles.buttonText}>Programar recordatorio</Text>
        </Pressable>
      </Card>

      <BodyText muted>Tus montos se guardan en SQLite local. FinanceApp no envía información a servidores.</BodyText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  button: {
    marginTop: spacing.sm,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonOutline: {
    marginTop: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonOutlineText: { fontWeight: '700' },
});
