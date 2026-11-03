import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiAdviceSettingsEditor } from '@/src/components/settings/AiAdviceSettingsEditor';
import { FixedExpenseTemplateEditor } from '@/src/components/settings/FixedExpenseTemplateEditor';
import { AccordionSection } from '@/src/components/ui/AccordionSection';
import { Card, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import type { ThemePreference } from '@/src/domain/themePreference';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

export default function AjustesScreen() {
  const { themePreference, setThemePreference } = useFinance();
  const colors = useThemeColors();

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Card>
        <SectionTitle>Apariencia</SectionTitle>
        <View style={styles.chips}>
          {(['light', 'dark'] as const satisfies ThemePreference[]).map((option) => {
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
                  {option === 'light' ? 'Claro' : 'Oscuro'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <AccordionSection title="Gastos fijos">
        <FixedExpenseTemplateEditor />
      </AccordionSection>

      <AccordionSection title="IA para consejos">
        <AiAdviceSettingsEditor />
      </AccordionSection>
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
});
