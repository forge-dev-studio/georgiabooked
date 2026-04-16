import { describe, it, expect, vi } from 'vitest';
import { rewriteArrest } from '../../scripts/rewrite';

describe('rewriteArrest', () => {
  it('produces 2-paragraph summary from facts', async () => {
    const mockGen = vi.fn().mockResolvedValue({
      response: { text: () => 'Paragraph one about the arrest.\n\nParagraph two with context.' },
    });

    const result = await rewriteArrest(
      {
        sourceId: 1,
        name: 'John Smith',
        county: 'Hall',
        charges: ['DUI'],
        bookingDate: '2026-04-14',
        sourceUrl: 'https://x',
        publishedAt: '2026-04-15T08:30:00',
      },
      { generateContent: mockGen as never }
    );

    expect(result).toContain('Paragraph one');
    expect(result).toContain('Paragraph two');
    expect(mockGen).toHaveBeenCalledOnce();
    const callArg = mockGen.mock.calls[0][0];
    expect(JSON.stringify(callArg)).toContain('John Smith');
    expect(JSON.stringify(callArg)).toContain('Hall');
    expect(JSON.stringify(callArg)).toContain('DUI');
  });

  it('retries on failure and propagates error after 3 tries', async () => {
    const mockGen = vi.fn().mockRejectedValue(new Error('rate limited'));
    await expect(
      rewriteArrest(
        {
          sourceId: 1,
          name: 'x',
          county: 'Hall',
          charges: ['x'],
          bookingDate: '2026-01-01',
          sourceUrl: 'x',
          publishedAt: '2026-01-01',
        },
        { generateContent: mockGen as never }
      )
    ).rejects.toThrow(/rate limited/);
    expect(mockGen).toHaveBeenCalledTimes(3);
  });
});
