import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BodyText, Card, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { pickAndParseWorkbook, exportDemoWorkbook } from '@/src/services/importExport';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';
import { Alert } from 'react-native';

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { completeOnboarding, loadExampleData, importFromParsed } = useFinance();

  const startBlank = async () => {
    await completeOnboarding();
    router.replace('/(tabs)/planilla');
  };

  const onImport = async () => {
    try {
      const parsed = await pickAndParseWorkbook();
      const result = await importFromParsed(parsed);
      Alert.alert('Importación lista', `Se cargaron ${result.transactions} movimientos y ${result.debts} deudas.`);
      router.replace('/(tabs)/planilla');
    } catch (e) {
      Alert.alert('Importación', e instanceof Error ? e.message : 'No se pudo importar');
    }
  };

  const onDemo = async () => {
    await loadExampleData();
    router.replace('/(tabs)/planilla');
  };

  const onExportTemplate = async () => {
    try {
      await exportDemoWorkbook();
    } catch (e) {
      Alert.alert('Exportación', e instanceof Error ? e.message : 'No se pudo exportar');
    }
  };

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Bienvenido a FinanceApp</Text>
      <BodyText muted>
        Tus números quedan solo en este dispositivo. Partí en blanco, importá tu planilla Excel o probá con datos de
        ejemplo ficticios.
      </BodyText>

      <Card>
        <SectionTitle>¿Cómo querís partir?</SectionTitle>
        <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={startBlank}>
          <Text style={styles.btnText}>Empezar en blanco</Text>
        </Pressable>
        <Pressable style={[styles.btnOutline, { borderColor: colors.primary }]} onPress={onImport}>
          <Text style={[styles.btnOutlineText, { color: colors.primary }]}>Importar mi planilla (.xlsx)</Text>
        </Pressable>
        <Pressable style={[styles.btnGhost, { backgroundColor: colors.surfaceMuted }]} onPress={onDemo}>
          <Text style={[styles.btnGhostText, { color: colors.text }]}>Cargar datos de ejemplo</Text>
        </Pressable>
        <Pressable style={[styles.btnOutline, { borderColor: colors.border }]} onPress={onExportTemplate}>
          <Text style={[styles.btnOutlineText, { color: colors.textSecondary, fontWeight: '600' }]}>
            Exportar plantilla Excel (.xlsx)
          </Text>
        </Pressable>
      </Card>

      <BodyText muted>
        La estructura sigue tu Excel: ingresos, gastos fijos, adicionales, fondos menos gastos, reserva y gastos del
        hogar compartidos.
      </BodyText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingTop: spacing.xl },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  btn: { borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnOutline: {
    borderRadius: radii.md,
    borderWidth: 2,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnOutlineText: { fontWeight: '800', fontSize: 16 },
  btnGhost: { borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  btnGhostText: { fontWeight: '600' },
});
