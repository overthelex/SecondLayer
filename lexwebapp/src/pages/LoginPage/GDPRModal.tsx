import { motion } from 'framer-motion';
import { ShieldCheck, ExternalLink, X } from 'lucide-react';

interface GDPRModalProps {
  onClose: () => void;
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

export function GDPRModal({ onClose }: GDPRModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-6 pb-4 border-b border-claude-border">
          <div className="w-10 h-10 bg-[#003399]/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={22} className="text-[#003399]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-sans text-claude-text font-medium">Відповідність GDPR</h2>
            <p className="text-xs text-claude-subtext font-sans">Регламент ЄС 2016/679</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-claude-bg text-claude-subtext hover:text-claude-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-5">
          <p className="text-sm text-claude-text font-sans leading-relaxed">
            Наш сервіс повністю відповідає вимогам <strong>Загального регламенту захисту даних (GDPR)</strong> Європейського Союзу. Ми забезпечуємо найвищий рівень захисту ваших персональних даних.
          </p>

          <div className="space-y-3">
            {COMPLIANCE_POINTS.map((item) => (
              <div key={item.article} className="flex gap-3 p-3 bg-claude-bg/50 rounded-xl">
                <div className="flex-shrink-0 w-6 h-6 bg-[#003399]/10 rounded-md flex items-center justify-center mt-0.5">
                  <ShieldCheck size={14} className="text-[#003399]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-claude-text font-sans">{item.title}</span>
                    <span className="text-[10px] text-[#003399] bg-[#003399]/10 px-1.5 py-0.5 rounded font-medium font-sans">{item.article}</span>
                  </div>
                  <p className="text-xs text-claude-subtext font-sans mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-claude-border">
            <p className="text-xs font-medium text-claude-text font-sans mb-3">Офіційні документи ЄС:</p>
            <div className="space-y-2">
              {OFFICIAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-[#003399] hover:text-[#002266] font-sans transition-colors group"
                >
                  <ExternalLink size={13} className="flex-shrink-0 opacity-60 group-hover:opacity-100" />
                  <span>{link.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-claude-border">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-[#003399] text-white rounded-xl hover:bg-[#002266] transition-colors font-sans font-medium text-sm"
          >
            Зрозуміло
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
