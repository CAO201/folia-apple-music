import { describe, it, expect } from 'vitest';
import { alignSentenceText, buildSentenceTimeline, hasSentenceTimeline, parseSentenceLyrics } from '../../../src/utils/lyrics/appleTiming';

// test/unit/appleMusic/sentenceTiming.test.ts
const text = '第一句\n第二句';
describe('real sentence timing only', () => {
    it('rejects plain and partly timed text rather than inventing a timeline', () => {
        expect(parseSentenceLyrics(text, 60000)).toBeNull();
        expect(parseSentenceLyrics('[00:01.00]第一句\n第二句', 60000)).toBeNull();
        expect(parseSentenceLyrics('[ar:Artist]\n[ti:Title]\nText', 60000)).toBeNull();
    });
    it('reads LRC starts and bounds the last line by the recording duration', () => {
        const parsed = parseSentenceLyrics('[00:01.00]第一句\n[00:05.00]第二句', 10000)!;
        expect(parsed.lines.filter(line => line.fullText.includes('句')).map(line => line.startTime)).toEqual([1, 5]);
        expect(Math.max(...parsed.lines.map(line => line.endTime))).toBeLessThanOrEqual(10);
        expect(hasSentenceTimeline(parsed, 10000)).toBe(true);
    });
    it('accepts Apple-format timed TTML and rejects untimed paragraphs', () => {
        const timed = '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line"><body><div><p itunes:key="L1" begin="00:01.000" end="00:03.000">One</p><p itunes:key="L2" begin="00:04.000" end="00:06.000">Two</p></div></body></tt>';
        expect(parseSentenceLyrics(timed, 10000)?.lines.filter(line => line.fullText === 'One')[0].startTime).toBe(1);
        expect(parseSentenceLyrics(timed.replace(' begin="00:04.000" end="00:06.000"', ''), 10000)).toBeNull();
    });
    it('does not accept invalid or incomplete manual marks', () => {
        for (const starts of [[1], [1, 1], [2, 1], [-1, 2], [1, NaN], [1, 60]]) {
            expect(() => buildSentenceTimeline(text, starts, 60)).toThrow('invalidTimes');
        }
        expect(() => buildSentenceTimeline(text, [1, 2], 0)).toThrow();
    });
    it('builds line-level timing without fabricating word-level timestamps', () => {
        const data = buildSentenceTimeline(text, [1.25, 4.5], 10);
        expect(data.isWordByWord).toBe(false);
        expect(data.lines.map(line => [line.startTime, line.endTime])).toEqual([[1.25, 4.5], [4.5, 10]]);
        expect(data.lines[0].words).toHaveLength(1);
    });
    it('only transfers a complete matching sequence and preserves repeated chorus occurrences', () => {
        const reference = buildSentenceTimeline('你好\n再见\n你好', [1, 5, 9], 12);
        expect(alignSentenceText('你好！\n再见。\n你好', reference, 12000)?.lines.map(line => line.startTime)).toEqual([1, 5, 9]);
        expect(alignSentenceText('你好\n其他\n你好', reference, 12000)).toBeNull();
        expect(alignSentenceText('你好\n再见', reference, 12000)).toBeNull();
    });
});
