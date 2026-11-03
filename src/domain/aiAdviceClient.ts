import type { MonthAdviceSummary } from './monthAdviceSummary';

export type AiAdviceProvider = 'gemini' | 'groq' | 'openai' | 'grok' | 'custom';

export interface AiProviderPreset {
  label: string;
  baseUrl: string;
  defaultModel: string;
  /** Muestra en UI de keys gratis. */
  freeTier?: boolean;
}

export const AI_PROVIDER_PRESETS: Record<AiAdviceProvider, AiProviderPreset> = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    freeTier: true,
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    freeTier: true,
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  grok: {
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-mini',
  },
  custom: {
    label: 'Personalizado',
    baseUrl: '',
    defaultModel: 'gpt-4o-mini',
  },
};

export const DEFAULT_AI_PROVIDER: AiAdviceProvider = 'gemini';

export const DEFAULT_AI_MODELS: Record<AiAdviceProvider, string> = {
  gemini: AI_PROVIDER_PRESETS.gemini.defaultModel,
  groq: AI_PROVIDER_PRESETS.groq.defaultModel,
  openai: AI_PROVIDER_PRESETS.openai.defaultModel,
  grok: AI_PROVIDER_PRESETS.grok.defaultModel,
  custom: AI_PROVIDER_PRESETS.custom.defaultModel,
};

export const FREE_AI_KEY_LINKS = {
  gemini: 'https://aistudio.google.com/apikey',
  groq: 'https://console.groq.com/keys',
} as const;

export interface AiAdviceConfig {
  provider: AiAdviceProvider;
  model: string;
  apiKey: string;
  customBaseUrl?: string;
}

export interface AiAdviceCard {
  title: string;
  detail: string;
  amountClp?: number;
}

export interface AiAdviceResult {
  payFirst: AiAdviceCard[];
  postpone: AiAdviceCard[];
  runwayRisk: { level: 'bajo' | 'medio' | 'alto'; detail: string };
  debtStrategy: { approach: 'snowball' | 'avalanche'; detail: string };
  steps: { text: string }[];
}

export function resolveAiBaseUrl(provider: AiAdviceProvider, customBaseUrl?: string): string {
  if (provider === 'custom') {
    const trimmed = customBaseUrl?.trim().replace(/\/$/, '');
    if (!trimmed) throw new Error('Indica la URL base del proveedor personalizado.');
    return trimmed;
  }
  return AI_PROVIDER_PRESETS[provider].baseUrl.replace(/\/$/, '');
}

export function buildAiAdvicePrompt(summary: MonthAdviceSummary, previewText: string): string {
  return `Eres un asesor financiero personal en Chile. Analiza el resumen del mes (montos en CLP enteros) y responde SOLO con JSON válido (sin markdown) con esta forma:
{
  "payFirst": [{"title": string, "detail": string, "amountClp": number opcional}],
  "postpone": [{"title": string, "detail": string}],
  "runwayRisk": {"level": "bajo"|"medio"|"alto", "detail": string},
  "debtStrategy": {"approach": "snowball"|"avalanche", "detail": string},
  "steps": [{"text": string}]
}

Instrucciones:
- Prioriza qué pagar primero, qué postergar, riesgo de quedarse sin dinero antes de fin de mes, estrategia de deudas (bola de nieve o avalancha) y pasos concretos.
- Usa montos en pesos chilenos (enteros) cuando menciones cifras.
- Tono cercano, claro, sin voseo argentino; español de Chile.
- No inventes ítems que no aparezcan en el resumen.

Resumen del mes:
${previewText}`;
}

/** Extrae JSON aunque venga envuelto en \`\`\`json ... \`\`\`. */
export function extractJsonFromModelText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]?.trim()) return fence[1].trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('La respuesta no trae JSON.');
  return jsonMatch[0];
}

export function parseAiAdviceResponse(raw: string): AiAdviceResult {
  const data = JSON.parse(extractJsonFromModelText(raw)) as AiAdviceResult;
  if (!data.runwayRisk || !data.debtStrategy || !Array.isArray(data.steps)) {
    throw new Error('JSON incompleto.');
  }
  return {
    payFirst: Array.isArray(data.payFirst) ? data.payFirst : [],
    postpone: Array.isArray(data.postpone) ? data.postpone : [],
    runwayRisk: data.runwayRisk,
    debtStrategy: data.debtStrategy,
    steps: data.steps,
  };
}

export async function requestAiMonthAdvice(
  summary: MonthAdviceSummary,
  previewText: string,
  config: AiAdviceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<AiAdviceResult> {
  if (!config.apiKey.trim()) throw new Error('Falta la API key en Ajustes.');

  const baseUrl = resolveAiBaseUrl(config.provider, config.customBaseUrl);
  const prompt = buildAiAdvicePrompt(summary, previewText);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model.trim() || DEFAULT_AI_MODELS[config.provider],
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'Respondes únicamente JSON válido para apps de finanzas personales.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch {
    throw new Error('Sin conexión o no se pudo contactar al proveedor.');
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (response.status === 401) throw new Error('API key inválida o expirada.');
    throw new Error(errText.slice(0, 120) || `Error del proveedor (${response.status}).`);
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error('Respuesta vacía del modelo.');
  return parseAiAdviceResponse(content);
}

export function allDefaultAiModels(): Set<string> {
  return new Set(Object.values(DEFAULT_AI_MODELS));
}
