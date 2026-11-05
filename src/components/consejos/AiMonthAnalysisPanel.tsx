import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { BodyText, Card, Pill, SectionTitle } from '@/src/components/ui/Primitives';
import { formatMonthAdviceSummaryPreview, type MonthAdviceSummary } from '@/src/domain/monthAdviceSummary';
import { requestAiMonthAdvice, type AiAdviceResult } from '@/src/domain/aiAdviceClient';
import { formatClp } from '@/src/domain/money';
import {
  getAiAdviceApiKey,
  loadAiAdviceSettings,
  setAiAdviceSkipPreview,
} from '@/src/services/aiAdviceSettings';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

interface Props {
  summary: MonthAdviceSummary | null;
}

export function AiMonthAnalysisPanel({ summary }: Props) {
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAdviceResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [skipPreviewNext, setSkipPreviewNext] = useState(false);

  const beginAnalysis = useCallback(async () => {
    if (!summary) {
      setError('No hay datos del mes para analizar.');
      return;
    }
    setError(null);
    const settings = await loadAiAdviceSettings(db);
    const apiKey = (await getAiAdviceApiKey()) ?? '';
    if (!apiKey.trim()) {
      setError('Agrega tu API key en Ajustes → IA para consejos.');
      return;
    }

    const preview = formatMonthAdviceSummaryPreview(summary);
    if (!settings.skipPreview) {
      setPreviewText(preview);
      setShowPreview(true);
      setSkipPreviewNext(false);
      return;
    }

    setLoading(true);
    try {
      const out = await requestAiMonthAdvice(summary, preview, {
        provider: settings.provider,
        model: settings.model,
        apiKey,
        customBaseUrl: settings.customBaseUrl,
      });
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar.');
    } finally {
      setLoading(false);
    }
  }, [db, summary]);

  const confirmSend = async () => {
    if (!summary) return;
    setShowPreview(false);
    setLoading(true);
    setError(null);
    try {
      if (skipPreviewNext) await setAiAdviceSkipPreview(db, true);
      const settings = await loadAiAdviceSettings(db);
      const apiKey = (await getAiAdviceApiKey()) ?? '';
      const out = await requestAiMonthAdvice(summary, previewText, {
        provider: settings.provider,
        model: settings.model,
        apiKey,
        customBaseUrl: settings.customBaseUrl,
      });
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <SectionTitle>Análisis con IA</SectionTitle>
      <BodyText muted>
        Envía un resumen anónimo del mes (sin historial). Tú controlas la key en Ajustes.
      </BodyText>
      <Pressable
        disabled={loading || !summary}
        onPress={() => void beginAnalysis()}
        style={[styles.btn, { backgroundColor: colors.primary, opacity: loading || !summary ? 0.6 : 1 }]}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Analizar mi mes con IA</Text>
        )}
      </Pressable>
      {error ? <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text> : null}

      {showPreview ? (
        <View style={[styles.previewBox, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
          <Text style={{ color: colors.text, fontWeight: '800', marginBottom: spacing.xs }}>Esto se enviará</Text>
          <ScrollView style={{ maxHeight: 200 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
              {previewText}
            </Text>
          </ScrollView>
          <View style={styles.previewActions}>
            <View style={styles.skipRow}>
              <Switch value={skipPreviewNext} onValueChange={setSkipPreviewNext} />
              <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
                No volver a mostrar vista previa
              </Text>
            </View>
            <Pressable onPress={() => setShowPreview(false)}>
              <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={() => void confirmSend()} style={[styles.sendBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {result ? <AiAdviceCards result={result} /> : null}
    </Card>
  );
}

function AiAdviceCards({ result }: { result: AiAdviceResult }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <AiSection title="Pagar primero" items={result.payFirst.map((c) => ({ title: c.title, body: c.detail, amount: c.amountClp }))} />
      <AiSection title="Postergar" items={result.postpone.map((c) => ({ title: c.title, body: c.detail }))} />
      <Card>
        <Text style={{ color: colors.text, fontWeight: '800' }}>Riesgo de quedar sin plata</Text>
        <Pill
          label={result.runwayRisk.level === 'alto' ? 'Alto' : result.runwayRisk.level === 'medio' ? 'Medio' : 'Bajo'}
          tone={result.runwayRisk.level === 'alto' ? 'danger' : result.runwayRisk.level === 'medio' ? 'warn' : 'ok'}
        />
        <BodyText>{result.runwayRisk.detail}</BodyText>
      </Card>
      <Card>
        <Text style={{ color: colors.text, fontWeight: '800' }}>Estrategia de deudas</Text>
        <BodyText>
          {result.debtStrategy.approach === 'snowball' ? 'Bola de nieve' : 'Avalancha'} — {result.debtStrategy.detail}
        </BodyText>
      </Card>
      <Card>
        <Text style={{ color: colors.text, fontWeight: '800' }}>Pasos concretos</Text>
        {result.steps.map((s, i) => (
          <BodyText key={`${i}-${s.text.slice(0, 12)}`}>
            {i + 1}. {s.text}
          </BodyText>
        ))}
      </Card>
    </View>
  );
}

function AiSection({
  title,
  items,
}: {
  title: string;
  items: { title: string; body: string; amount?: number }[];
}) {
  const colors = useThemeColors();
  if (items.length === 0) return null;
  return (
    <Card>
      <Text style={{ color: colors.text, fontWeight: '800' }}>{title}</Text>
      {items.map((item, i) => (
        <View key={`${title}-${i}`} style={{ marginTop: spacing.xs }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{item.title}</Text>
          <BodyText>
            {item.body}
            {item.amount != null && item.amount > 0 ? ` (${formatClp(item.amount)})` : ''}
          </BodyText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  btnText: { color: '#fff', fontWeight: '800' },
  previewBox: { borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm, gap: spacing.sm },
  previewActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, justifyContent: 'flex-end' },
  skipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: '100%' },
  sendBtn: { borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
