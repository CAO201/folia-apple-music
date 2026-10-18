import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appleSearchRegions, useAppleSearchSettingsStore } from '../../../stores/useAppleSearchSettingsStore';

// src/components/app/search/AppleSearchRegionControl.tsx
export default function AppleSearchRegionControl({ onApply, initialExpanded = false }: { onApply?: () => void; initialExpanded?: boolean }) {
    const { t, i18n } = useTranslation();
    const { region, confirmed, setRegion } = useAppleSearchSettingsStore();
    const [expanded, setExpanded] = useState(initialExpanded || !confirmed);
    const [draft, setDraft] = useState(region);
    const [filter, setFilter] = useState('');
    const names = useMemo(() => new Intl.DisplayNames([i18n.resolvedLanguage || 'zh-CN'], { type: 'region' }), [i18n.resolvedLanguage]);
    const english = useMemo(() => new Intl.DisplayNames(['en'], { type: 'region' }), []);
    const options = useMemo(() => appleSearchRegions.filter(code =>
        `${code} ${names.of(code)} ${english.of(code)}`.toLowerCase().includes(filter.trim().toLowerCase())
    ).sort((a, b) => (names.of(a) || a).localeCompare(names.of(b) || b, i18n.resolvedLanguage)), [filter, names, english, i18n.resolvedLanguage]);
    return <div className="w-full max-w-xl text-sm" data-testid="apple-search-region">
        <button type="button" className="rounded-full border border-current/20 px-4 py-2" onClick={() => { setDraft(region); setExpanded(!expanded); }} aria-expanded={expanded}>
            Apple Music · {names.of(region)} ({region}) · {t('appleSearch.region')}
        </button>
        {expanded && <div className="mt-3 flex flex-col gap-3 rounded-xl border border-current/20 p-4">
            <p className="opacity-70">{t(confirmed ? 'appleSearch.description' : 'appleSearch.firstSearch')}</p>
            <input aria-label={t('appleSearch.filter')} placeholder={t('appleSearch.filter')} value={filter} onChange={event => setFilter(event.target.value)} className="rounded-lg border border-current/20 bg-transparent p-2 outline-none" />
            <select aria-label={t('appleSearch.region')} size={6} value={options.includes(draft) ? draft : ''} onChange={event => setDraft(event.target.value)} className="w-full rounded-lg border border-current/20 bg-transparent p-2 outline-none">
                {options.map(code => <option key={code} value={code} className="bg-neutral-900 text-white">{names.of(code)} ({code})</option>)}
            </select>
            {options.length === 0 && <p>{t('appleSearch.noRegions')}</p>}
            <button type="button" disabled={!options.includes(draft)} className="self-start rounded-full border border-current/30 px-4 py-2 disabled:opacity-40" onClick={() => {
                setRegion(draft); setExpanded(false); onApply?.();
            }}>{t('appleSearch.apply')}</button>
        </div>}
    </div>;
}
