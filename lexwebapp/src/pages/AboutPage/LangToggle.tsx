import { useLocaleStore, type AppLanguage } from '../../stores/localeStore';

const OPTS: { code: AppLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UA' },
];

export function LangToggle() {
  const language = useLocaleStore((s) => s.language);
  const setLanguage = useLocaleStore((s) => s.setLanguage);
  const current: AppLanguage = language === 'uk' || language === 'ru' ? 'uk' : 'en';

  return (
    <div className="flex items-center gap-1 rounded-full border border-claude-border bg-white p-0.5">
      {OPTS.map((o) => (
        <button
          key={o.code}
          onClick={() => setLanguage(o.code)}
          className={`px-2.5 py-1 rounded-full text-xs font-sans font-medium transition-colors ${
            current === o.code
              ? 'bg-claude-accent text-white'
              : 'text-claude-subtext hover:text-claude-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
