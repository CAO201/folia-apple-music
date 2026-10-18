import { Converter } from 'opencc-js';

// src/utils/appleSearchQueries.ts
const simplify = Converter({ from: 'tw', to: 'cn' });
const aliases: Array<[string, string]> = [
    ['周杰伦', 'Jay Chou'], ['陈奕迅', 'Eason Chan'], ['王菲', 'Faye Wong'],
    ['林俊杰', 'JJ Lin'], ['孙燕姿', 'Stefanie Sun'], ['邓紫棋', 'G.E.M.'],
    ['蔡依林', 'Jolin Tsai'], ['张学友', 'Jacky Cheung'], ['刘德华', 'Andy Lau'],
    ['张惠妹', 'aMEI'], ['五月天', 'Mayday'], ['梁静茹', 'Fish Leong'],
];
export function alternateAppleSearchQuery(query: string): string | undefined {
    const simplified = simplify(query).trim();
    for (const [chinese, english] of aliases) {
        if (simplified.includes(chinese)) return simplified.replace(chinese, english);
        const index = simplified.toLowerCase().indexOf(english.toLowerCase());
        if (index >= 0) return simplified.slice(0, index) + chinese + simplified.slice(index + english.length);
    }
    return simplified !== query.trim() ? simplified : undefined;
}
