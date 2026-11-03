import type { MonthAdviceSummary } from '../monthAdviceSummary';
import {
  parseAiAdviceResponse,
  requestAiMonthAdvice,
  resolveAiBaseUrl,
} from '../aiAdviceClient';

const summary: MonthAdviceSummary = {
  monthKey: '2026-11',
  daysLeftInMonth: 10,
  incomeClp: 1_000_000,
  availableClp: 200_000,
  pendingOutflowsClp: 400_000,
  paidSoFarClp: 0,
  reserveClp: 0,
  fixedItems: [],
  additionalItems: [],
  debts: [],
  debtStrategyRecommendation: 'avalanche',
  projectedShortfallClp: 50_000,
  dailyAllowanceClp: 15_000,
};

describe('aiAdviceClient', () => {
  it('resuelve URLs de proveedor', () => {
    expect(resolveAiBaseUrl('openai')).toContain('openai.com');
    expect(resolveAiBaseUrl('grok')).toContain('x.ai');
    expect(resolveAiBaseUrl('custom', 'https://proxy.example/v1')).toBe('https://proxy.example/v1');
  });

  it('parsea JSON de respuesta', () => {
    const parsed = parseAiAdviceResponse(`{"payFirst":[],"postpone":[],"runwayRisk":{"level":"medio","detail":"x"},"debtStrategy":{"approach":"avalanche","detail":"y"},"steps":[{"text":"z"}]}`);
    expect(parsed.steps[0].text).toBe('z');
  });

  it('llama chat/completions con fetch mockeado', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                payFirst: [{ title: 'Arriendo', detail: 'Primero', amountClp: 300000 }],
                postpone: [],
                runwayRisk: { level: 'alto', detail: 'Aprieta' },
                debtStrategy: { approach: 'snowball', detail: 'Motivación' },
                steps: [{ text: 'Paga arriendo' }],
              }),
            },
          },
        ],
      }),
    });

    const result = await requestAiMonthAdvice(
      summary,
      'preview',
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key' },
      mockFetch as unknown as typeof fetch,
    );

    expect(result.payFirst[0].title).toBe('Arriendo');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
  });
});
