import type { MonthAdviceSummary } from './monthAdviceSummary';

export type AiAdviceProvider = 'openai' | 'grok' | 'custom';

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

export const DEFAULT_AI_MODELS: Record<AiAdviceProvider, string> = {
  openai: 'gpt-4o-mini',
  grok: 'grok-3-mini',
  custom: 'gpt-4o-mini',
};

export function resolveAiBaseUrl(provider: AiAdviceProvider, customBaseUrl?: string): string {
  if (provider === 'grok') return 'https://api.x.ai/v1';
  if (provider === 'custom') {
    const trimmed = customBaseUrl?.trim().replace(/\/$/, '');
    if (!trimmed) throw new Error('Indica la URL base del proveedor personalizado.');
    return trimmed;
  }
  return 'https://api.openai.com/v1';
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

export function parseAiAdviceResponse(raw: string): AiAdviceResult {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('La respuesta no trae JSON.');
  const data = JSON.parse(jsonMatch[0]) as AiAdviceResult;
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
