import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { classifyDatabaseError } from '@/src/db/migrate';
import { palette } from '@/src/theme/tokens';
import { spacing, radii } from '@/src/theme/tokens';

interface Props {
  error: Error;
  onRetry: () => void;
  onResetLocal: () => void;
  resetting?: boolean;
}

export function DatabaseErrorScreen({ error, onRetry, onResetLocal, resetting }: Props) {
  const colors = palette.light;
  const info = classifyDatabaseError(error);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>{info.title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{info.message}</Text>
      {info.suggestOtherTabs ? (
        <View style={[styles.tip, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
          <Text style={{ color: colors.text, lineHeight: 22 }}>
            Tip: deja solo una pestaña con FinanceApp abierta. En Chrome/Safari, revisa pestañas en segundo plano del
            mismo sitio.
          </Text>
        </View>
      ) : null}
      <Text style={[styles.technical, { color: colors.textSecondary }]} selectable>
        Detalle técnico: {error.message}
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={[styles.btn, { backgroundColor: colors.primary }]}>
        <Text style={styles.btnText}>Reintentar</Text>
      </Pressable>

      {info.suggestReset ? (
        <Pressable
          accessibilityRole="button"
          disabled={resetting}
          onPress={onResetLocal}
          style={[styles.btnOutline, { borderColor: colors.danger, opacity: resetting ? 0.5 : 1 }]}>
          <Text style={[styles.btnOutlineText, { color: colors.danger }]}>
            {resetting ? 'Reiniciando…' : 'Reiniciar datos locales'}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function AppLoadingScreen({ slowHint }: { slowHint?: boolean }) {
  const colors = palette.light;
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Preparando FinanceApp…</Text>
      {slowHint ? (
        <Text style={[styles.slowHint, { color: colors.textSecondary }]}>
          La primera carga en web puede tardar. Si se demora mucho, cierra otras pestañas y recarga.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingTop: spacing.xl },
  title: { fontSize: 24, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 24 },
  tip: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md },
  technical: { fontSize: 12, fontFamily: 'monospace' },
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  loadingText: { fontSize: 16, fontWeight: '600' },
  slowHint: { textAlign: 'center', lineHeight: 22, maxWidth: 320 },
});
