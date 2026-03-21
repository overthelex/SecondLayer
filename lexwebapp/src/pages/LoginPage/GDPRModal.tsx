import { motion } from 'framer-motion';
import { ShieldCheck, ExternalLink, X } from 'lucide-react';

interface GDPRModalProps {
  onClose: () => void;
  isDark?: boolean;
}

const COMPLIANCE_POINTS = [
  {
    title: 'Законність обробки даних',
    desc: 'Обробка персональних даних здійснюється виключно на підставі вашої згоди або для виконання договору.',
    article: 'Ст. 6 GDPR',
  },
  {
    title: 'Право на доступ до даних',
    desc: 'Ви маєте право отримати інформацію про те, які ваші дані ми обробляємо, та отримати їх копію.',
    article: 'Ст. 15 GDPR',
  },
  {
    title: 'Право на видалення',
    desc: 'Ви можете вимагати повного видалення ваших персональних даних з наших систем у будь-який час.',
    article: 'Ст. 17 GDPR',
  },
  {
    title: 'Право на перенесення даних',
    desc: 'Ви маєте право отримати ваші дані у структурованому форматі для передачі іншому оператору.',
    article: 'Ст. 20 GDPR',
  },
  {
    title: 'Захист за замовчуванням',
    desc: 'Ми застосовуємо принципи privacy by design та privacy by default до всіх наших процесів.',
    article: 'Ст. 25 GDPR',
  },
  {
    title: 'Безпека обробки',
    desc: 'Дані захищені шифруванням, контролем доступу та регулярним аудитом безпеки.',
    article: 'Ст. 32 GDPR',
  },
];

const OFFICIAL_LINKS = [
  { href: 'https://eur-lex.europa.eu/legal-content/UK/TXT/?uri=CELEX:32016R0679', label: 'Регламент (ЄС) 2016/679 — повний текст українською' },
  { href: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679', label: 'General Data Protection Regulation (GDPR) — English' },
  { href: 'https://commission.europa.eu/law/law-topic/data-protection_en', label: 'European Commission — Data Protection' },
  { href: 'https://edpb.europa.eu/', label: 'European Data Protection Board (EDPB)' },
];

export function GDPRModal({ onClose, isDark = true }: GDPRModalProps) {
  const t = isDark;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4 ${t ? 'bg-black/80' : 'bg-black/40'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.2 }}
        className={`border rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col ${t ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'}`}
      >
        {/* Header */}
        <div className={`flex items-center gap-3 px-6 py-5 border-b ${t ? 'border-zinc-800' : 'border-zinc-200'}`}>
          <div className="w-9 h-9 bg-[#003399]/10 border border-[#003399]/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={17} className="text-[#4d6ef5]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className={`text-base font-semibold ${t ? 'text-zinc-100' : 'text-zinc-900'}`}>Відповідність GDPR</h2>
            <p className={`text-xs ${t ? 'text-zinc-600' : 'text-zinc-400'}`}>Регламент ЄС 2016/679</p>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${t ? 'hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300' : 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600'}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <p className={`text-sm leading-relaxed ${t ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Наш сервіс повністю відповідає вимогам{' '}
            <strong className={`font-medium ${t ? 'text-zinc-200' : 'text-zinc-800'}`}>Загального регламенту захисту даних (GDPR)</strong>{' '}
            Європейського Союзу. Ми забезпечуємо найвищий рівень захисту ваших персональних даних.
          </p>

          <div className="space-y-2">
            {COMPLIANCE_POINTS.map((item) => (
              <div
                key={item.article}
                className={`flex gap-3 px-4 py-3 border rounded-lg ${t ? 'bg-zinc-900 border-zinc-800/60' : 'bg-zinc-50 border-zinc-200'}`}
              >
                <div className="flex-shrink-0 w-5 h-5 bg-[#003399]/10 border border-[#003399]/20 rounded flex items-center justify-center mt-0.5">
                  <ShieldCheck size={12} className="text-[#4d6ef5]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-sm font-medium ${t ? 'text-zinc-200' : 'text-zinc-800'}`}>{item.title}</span>
                    <span className="text-[10px] text-[#4d6ef5] bg-[#003399]/10 border border-[#003399]/20 px-1.5 py-0.5 rounded font-semibold tracking-wider uppercase">{item.article}</span>
                  </div>
                  <p className={`text-xs leading-relaxed ${t ? 'text-zinc-500' : 'text-zinc-500'}`}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className={`pt-1 border-t ${t ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <p className={`text-xs font-medium uppercase tracking-wider mb-3 ${t ? 'text-zinc-500' : 'text-zinc-400'}`}>Офіційні документи ЄС</p>
            <div className="space-y-2">
              {OFFICIAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 text-xs transition-colors group ${t ? 'text-zinc-500 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-800'}`}
                >
                  <ExternalLink size={12} className="flex-shrink-0 opacity-50 group-hover:opacity-100" />
                  <span>{link.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t ${t ? 'border-zinc-800' : 'border-zinc-200'}`}>
          <button
            onClick={onClose}
            className={`w-full px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors duration-150 ${t ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-100' : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-200 text-zinc-800'}`}
          >
            Зрозуміло
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
