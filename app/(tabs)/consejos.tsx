import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiMonthAnalysisPanel } from '@/src/components/consejos/AiMonthAnalysisPanel';
import { BodyText, Card, Pill, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

export default function ConsejosScreen() {
  const { advice, monthAdviceSummary } = useFinance();
  const colors = useThemeColors();

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Consejos para decidir mejor</Text>
      <BodyText muted>Prioridades del mes según tu planilla (sin enviar nada a internet).</BodyText>

      {advice.map((item) => (
        <Card key={item.id}>
          <View style={styles.row}>
            <SectionTitle>{item.title}</SectionTitle>
            <Pill
              label={item.priority === 'alta' ? 'Prioridad alta' : item.priority === 'media' ? 'Revisar' : 'Tip'}
              tone={item.priority === 'alta' ? 'danger' : item.priority === 'media' ? 'warn' : 'neutral'}
            />
          </View>
          <BodyText>{item.body}</BodyText>
        </Card>
      ))}

      <AiMonthAnalysisPanel summary={monthAdviceSummary} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: '800' },
  row: { gap: spacing.sm },
});
