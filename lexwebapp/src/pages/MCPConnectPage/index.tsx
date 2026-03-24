import { motion } from 'framer-motion';
import { Plug, Clock } from 'lucide-react';
import { useMiscT } from '../../i18n/misc-i18n';

interface Connector {
  id: string;
  name: string;
  descriptionKey: 'mcpNextcloudDesc' | 'mcpGoogleDriveDesc';
  icon: React.ReactNode;
}

const CONNECTORS: Connector[] = [
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    descriptionKey: 'mcpNextcloudDesc',
    icon: <NextcloudIcon />,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    descriptionKey: 'mcpGoogleDriveDesc',
    icon: <GoogleDriveIcon />,
  },
];

export function MCPConnectPage() {
  const { t } = useMiscT();

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-claude-accent/10 rounded-xl">
            <Plug size={22} className="text-claude-accent" />
          </div>
          <h1 className="text-xl font-semibold text-claude-text font-sans tracking-tight">
            {t('mcpTitle')}
          </h1>
        </div>
        <p className="text-[13px] text-claude-subtext font-sans mb-8 ml-[46px]">
          {t('mcpSubtitle')}
        </p>

        <div className="space-y-4">
          {CONNECTORS.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              description={t(connector.descriptionKey)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConnectorCard({
  connector,
  description,
}: {
  connector: Connector;
  description: string;
}) {
  const { t } = useMiscT();
  const { name, icon } = connector;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-claude-border p-5 flex items-center gap-4"
    >
      <div className="w-10 h-10 rounded-xl bg-claude-bg flex items-center justify-center shrink-0 opacity-60">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-claude-text font-sans">{name}</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 rounded-full font-sans">
            <Clock size={10} />
            {t('mcpComingSoon')}
          </span>
        </div>
        <p className="text-[12px] text-claude-subtext font-sans mt-0.5">{description}</p>
        <p className="text-[11px] text-claude-subtext/70 font-sans mt-1 italic">
          {t('mcpComingSoonNote')}
        </p>
      </div>

      <div className="shrink-0">
        <button
          disabled
          className="px-4 py-2 text-[12px] font-medium text-claude-subtext bg-claude-bg rounded-lg font-sans opacity-40 cursor-not-allowed"
        >
          {t('connect')}
        </button>
      </div>
    </motion.div>
  );
}

function NextcloudIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4.5" stroke="#0082C9" strokeWidth="2" />
      <circle cx="5" cy="12" r="2.5" stroke="#0082C9" strokeWidth="1.5" />
      <circle cx="19" cy="12" r="2.5" stroke="#0082C9" strokeWidth="1.5" />
    </svg>
  );
}

function GoogleDriveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M8.5 2.5L1 15h6.5l7.5-12.5H8.5z" fill="#0066DA" />
      <path d="M15 2.5L7.5 15H1l7.5-12.5H15z" fill="#00AC47" opacity="0.8" />
      <path d="M15 2.5l7.5 12.5H16L8.5 2.5H15z" fill="#EA4335" opacity="0.8" />
      <path d="M1 15h6.5l3.25 5.5H4.25L1 15z" fill="#00832D" />
      <path d="M7.5 15h9l-3.25 5.5h-9L7.5 15z" fill="#2684FC" />
      <path d="M16 15h6.5l-3.25 5.5h-6.5L16 15z" fill="#FFBA00" />
    </svg>
  );
}
