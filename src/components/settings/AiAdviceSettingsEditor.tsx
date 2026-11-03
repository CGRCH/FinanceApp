import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { BodyText, Card, SectionTitle } from '@/src/components/ui/Primitives';
import { DEFAULT_AI_MODELS, type AiAdviceProvider } from '@/src/domain/aiAdviceClient';
import {
  isAiKeyStoredOnWeb,
  loadAiAdviceSettings,
  saveAiAdviceSettings,
  setAiAdviceApiKey,
  getAiAdviceApiKey,
} from '@/src/services/aiAdviceSettings';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

const PROVIDERS: { id: AiAdviceProvider; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'grok', label: 'xAI Grok' },
  { id: 'custom', label: 'Personalizado' },
];

export function AiAdviceSettingsEditor() {
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const [provider, setProvider] = useState<AiAdviceProvider>('openai');
  const [model, setModel] = useState(DEFAULT_AI_MODELS.openai);
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const s = await loadAiAdviceSettings(db);
    setProvider(s.provider);
    setModel(s.model);
    setCustomBaseUrl(s.customBaseUrl);
    const key = await getAiAdviceApiKey();
    setHasKey(!!key?.trim());
    setApiKeyDraft('');
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pickProvider = async (p: AiAdviceProvider) => {
    setProvider(p);
    const nextModel = model.trim() ? model : DEFAULT_AI_MODELS[p];
    if (!model.trim() || Object.values(DEFAULT_AI_MODELS).includes(model as (typeof DEFAULT_AI_MODELS)[AiAdviceProvider])) {
      setModel(DEFAULT_AI_MODELS[p]);
    }
    await saveAiAdviceSettings(db, { provider: p, model: nextModel, customBaseUrl });
    setSavedHint('Guardado');
    setTimeout(() => setSavedHint(null), 2000);
  };

  const saveModel = async () => {
    await saveAiAdviceSettings(db, { provider, model, customBaseUrl });
    setSavedHint('Guardado');
    setTimeout(() => setSavedHint(null), 2000);
  };

  const saveKey = async () => {
    await setAiAdviceApiKey(apiKeyDraft);
    setHasKey(!!apiKeyDraft.trim());
    setApiKeyDraft('');
    setSavedHint('Key guardada en este dispositivo');
    setTimeout(() => setSavedHint(null), 2500);
  };

  return (
    <Card>
      <SectionTitle>IA para consejos</SectionTitle>
      <BodyText muted>
        Opcional. La key no sale de tu dispositivo y no se sube a ningún servidor nuestro.
      </BodyText>
      {isAiKeyStoredOnWeb() ? (
        <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }}>
          En web la key se guarda en localStorage del navegador (menos seguro que el celular). No la compartas.
        </Text>
      ) : null}

      <Text style={[styles.label, { color: colors.textSecondary }]}>Proveedor</Text>
      <View style={styles.chips}>
        {PROVIDERS.map((p) => {
          const selected = provider === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => void pickProvider(p.id)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
                },
              ]}>
              <Text style={{ color: colors.text, fontWeight: selected ? '700' : '500' }}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {provider === 'custom' ? (
        <>
          <Text style={[styles.label, { color: colors.textSecondary }]}>URL base (OpenAI-compatible)</Text>
          <TextInput
            value={customBaseUrl}
            onChangeText={setCustomBaseUrl}
            onBlur={() => void saveModel()}
            placeholder="https://api.ejemplo.com/v1"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
        </>
      ) : null}

      <Text style={[styles.label, { color: colors.textSecondary }]}>Modelo</Text>
      <TextInput
        value={model}
        onChangeText={setModel}
        onBlur={() => void saveModel()}
        placeholder={DEFAULT_AI_MODELS[provider]}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>API key</Text>
      <TextInput
        value={apiKeyDraft}
        onChangeText={setApiKeyDraft}
        placeholder={hasKey ? '•••••••• (ya hay una guardada)' : 'sk-…'}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
      <Pressable onPress={() => void saveKey()} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar key</Text>
      </Pressable>
      {hasKey ? (
        <Pressable
          onPress={() => {
            void setAiAdviceApiKey('');
            setHasKey(false);
          }}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>Borrar key de este dispositivo</Text>
        </Pressable>
      ) : null}
      {savedHint ? <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{savedHint}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    marginTop: 4,
  },
  saveBtn: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
});
