import type { LyricData } from '../../types';
import { parseLyricsByFormat, isInterludeLine, type LyricParseFormat } from './parserCore';
import { detectTimedLyricFormat } from './formatDetection';
import { DOMParser } from '@xmldom/xmldom';
import { normalizeLyricMatchText } from './matchScore';

// src/utils/lyrics/appleTiming.ts
export function hasSentenceTimeline(data: LyricData | null | undefined, durationMs = 0): data is LyricData {
    const lines = data?.lines.filter(line => line.fullText.trim() && !isInterludeLine(line)) || [];
    return lines.length > 0 && lines.every((line, index) =>
        Number.isFinite(line.startTime) && Number.isFinite(line.endTime)
        && line.startTime >= 0 && line.endTime > line.startTime
        && (!index || line.startTime >= lines[index - 1].startTime)
        && (!durationMs || line.startTime < durationMs / 1000)
    ) && (lines.length === 1 || new Set(lines.map(line => line.startTime)).size > 1);
}

// Reject plain text before invoking parsers which can synthesize display times for untimed text.
export function hasDeclaredSentenceTimes(text: string, format: LyricParseFormat): boolean {
    if (format === 'ttml') {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        const paragraphs = Array.from(doc.getElementsByTagNameNS('*', 'p'));
        return paragraphs.length > 0 && paragraphs.every(p => p.hasAttribute('begin')
            || Array.from(p.getElementsByTagNameNS('*', 'span')).some(span => span.hasAttribute('begin')));
    }
    if (format === 'vtt') return /\d{2}:\d{2}\.\d{3}\s*-->/.test(text);
    if (format === 'qrc' || format === 'krc') return true; // These dedicated decoders never assign plain-text timings.
    const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
        .filter(line => !/^\[(?:ar|al|ti|by|offset|length|re|ve):/i.test(line) && !/^\{/.test(line));
    return rows.length > 0 && rows.every(line => format === 'yrc'
        ? /^\[\d+,\d+\]/.test(line) : /^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(line));
}
export function parseSentenceLyrics(text: string, durationMs = 0, hint?: LyricParseFormat): LyricData | null {
    try {
        const format = hint || (/^\[\d+,\d+\]/m.test(text) ? 'yrc' : detectTimedLyricFormat(text));
        if (!hasDeclaredSentenceTimes(text, format)) return null;
        const data = parseLyricsByFormat(format, text);
        if (!hasSentenceTimeline(data, durationMs)) return null;
        if (durationMs > 0) {
            const duration = durationMs / 1000;
            for (const line of data.lines) {
                line.endTime = Math.min(line.endTime, duration);
                for (const word of line.words) word.endTime = Math.min(word.endTime, duration);
            }
        }
        return data;
    } catch { return null; }
}
export function buildSentenceTimeline(text: string, starts: number[], duration: number): LyricData {
    const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!rows.length || rows.length !== starts.length || !Number.isFinite(duration) || duration <= 0
        || starts.some((time, i) => !Number.isFinite(time) || time < 0 || time >= duration || (i > 0 && time <= starts[i - 1]))) {
        throw new Error('appleTiming.invalidTimes');
    }
    return { isWordByWord: false, lines: rows.map((fullText, i) => {
        const startTime = starts[i];
        const endTime = starts[i + 1] ?? duration;
        return { fullText, startTime, endTime, words: [{ text: fullText, startTime, endTime }] };
    }) };
}
// Only transfer a complete, one-to-one sequence. Repeated choruses retain their occurrence order.
export function alignSentenceText(text: string, reference: LyricData, durationMs: number): LyricData | null {
    if (!hasSentenceTimeline(reference, durationMs)) return null;
    const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const lines = reference.lines.filter(line => line.fullText.trim() && !isInterludeLine(line));
    const norm = (s: string) => normalizeLyricMatchText(s).replace(/[\p{P}\p{Z}\p{S}]/gu, '');
    if (rows.length !== lines.length || rows.some((row, i) => !norm(row) || norm(row) !== norm(lines[i].fullText))) return null;
    return { isWordByWord: false, lines: rows.map((fullText, i) => ({ fullText,
        startTime: lines[i].startTime, endTime: lines[i].endTime,
        words: [{ text: fullText, startTime: lines[i].startTime, endTime: lines[i].endTime }],
    })) };
}
