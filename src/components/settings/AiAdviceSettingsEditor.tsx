import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { BodyText } from '@/src/components/ui/Primitives';
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_AI_MODELS,
  DEFAULT_AI_PROVIDER,
  FREE_AI_KEY_LINKS,
  allDefaultAiModels,
  type AiAdviceProvider,
} from '@/src/domain/aiAdviceClient';
import {
  isAiKeyStoredOnWeb,
  loadAiAdviceSettings,
  saveAiAdviceSettings,
  setAiAdviceApiKey,
  getAiAdviceApiKey,
} from '@/src/services/aiAdviceSettings';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

const PROVIDER_ORDER: AiAdviceProvider[] = ['gemini', 'groq', 'openai', 'grok', 'custom'];

function providerChipLabel(id: AiAdviceProvider): string {
  const preset = AI_PROVIDER_PRESETS[id];
  if (preset.freeTier) return `${preset.label} (gratis)`;
  return preset.label;
}

export function AiAdviceSettingsEditor() {
  const db = useSQLiteContext();
  const colors = useThemeColors();
  const [provider, setProvider] = useState<AiAdviceProvider>(DEFAULT_AI_PROVIDER);
  const [model, setModel] = useState(DEFAULT_AI_MODELS.gemini);
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
    const defaults = allDefaultAiModels();
    const nextModel =
      !model.trim() || defaults.has(model) ? DEFAULT_AI_MODELS[p] : model;
    if (defaults.has(model) || !model.trim()) {
      setModel(DEFAULT_AI_MODELS[p]);
    }
    await saveAiAdviceSettings(db, {
      provider: p,
      model: defaults.has(model) ? DEFAULT_AI_MODELS[p] : nextModel,
      customBaseUrl: p === 'custom' ? customBaseUrl : '',
    });
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

  const openLink = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <>
      <BodyText muted>
        Opcional. La key no sale de tu dispositivo y no se sube a ningún servidor nuestro.
      </BodyText>
      <BodyText muted>
        Para probar gratis:{' '}
        <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => openLink(FREE_AI_KEY_LINKS.gemini)}>
          Google AI Studio
        </Text>
        {' · '}
        <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => openLink(FREE_AI_KEY_LINKS.groq)}>
          Groq Console
        </Text>
        . En planes gratuitos, los proveedores pueden usar tus datos para mejorar modelos; revisa sus políticas.
      </BodyText>
      {isAiKeyStoredOnWeb() ? (
        <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }}>
          En web la key se guarda en localStorage del navegador (menos seguro que el celular). No la compartas.
        </Text>
      ) : null}

      <Text style={[styles.label, { color: colors.textSecondary }]}>Proveedor</Text>
      <View style={styles.chips}>
        {PROVIDER_ORDER.map((id) => {
          const selected = provider === id;
          return (
            <Pressable
              key={id}
              onPress={() => void pickProvider(id)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
                },
              ]}>
              <Text style={{ color: colors.text, fontWeight: selected ? '700' : '500', fontSize: 13 }}>
                {providerChipLabel(id)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {provider !== 'custom' ? (
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs }}>
          URL: {AI_PROVIDER_PRESETS[provider].baseUrl}
        </Text>
      ) : null}

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
        placeholder={hasKey ? '•••••••• (ya hay una guardada)' : provider === 'gemini' ? 'AIza…' : 'sk-…'}
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
    </>
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
