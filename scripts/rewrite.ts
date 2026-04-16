import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ArrestFacts } from './extract-facts.ts';
import { classifyWorst, SEVERITY_LABEL } from '../src/lib/severity.ts';

export interface GenerativeClient {
  generateContent: (prompt: string) => Promise<{ response: { text: () => string } }>;
}

const SYSTEM_PROMPT = `You are a news editor writing neutral, factual summaries of public arrest records for GeorgiaBooked, a Georgia arrest-tracker website.

Rules:
- Write exactly 2 paragraphs.
- Paragraph 1: state the factual booking (who, where, when, charges) in objective, journalistic prose. Include presumption of innocence language ("is alleged to have", "was charged with").
- Paragraph 2: provide contextual background on the severity category of the charges, typical statutory consequences in Georgia, or related local context. Do not speculate about guilt.
- Use third-person past tense.
- No sensational language. No adjectives like "shocking," "brazen," "horrifying."
- Do not invent facts not provided in the input.
- Do not include headlines or bullet points.
- Do not use em dashes or emojis.
- Output only the two paragraphs, separated by a single blank line. No preamble.`;

export async function rewriteArrest(
  facts: ArrestFacts,
  client: GenerativeClient,
  maxRetries = 3
): Promise<string> {
  const severity = classifyWorst(facts.charges);
  const prompt = `${SYSTEM_PROMPT}

Facts:
- Name: ${facts.name}
- County: ${facts.county} County, Georgia
- Booking Date: ${facts.bookingDate}
- Charges: ${facts.charges.join('; ')}
- Severity: ${SEVERITY_LABEL[severity]}

Write the summary:`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.generateContent(prompt);
      const text = result.response.text().trim();
      if (!text) throw new Error('empty response');
      return text;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastError ?? new Error('rewrite failed');
}

export function createGeminiClient(apiKey: string): GenerativeClient {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  return {
    generateContent: async (prompt: string) => {
      const result = await model.generateContent(prompt);
      return { response: { text: () => result.response.text() } };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
