import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plug, Cloud, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Connector {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: ConnectionStatus;
}

export function MCPConnectPage() {
  const [connectors, setConnectors] = useState<Connector[]>([
    {
      id: 'nextcloud',
      name: 'Nextcloud',
      description: 'Синхронізація документів та файлів з вашого Nextcloud сервера',
      icon: <NextcloudIcon />,
      status: 'disconnected',
    },
    {
      id: 'google-drive',
      name: 'Google Drive',
      description: 'Доступ до файлів та документів з Google Drive',
      icon: <GoogleDriveIcon />,
      status: 'disconnected',
    },
  ]);

  const handleConnect = (id: string) => {
    setConnectors(prev =>
      prev.map(c => c.id === id ? { ...c, status: 'connecting' as ConnectionStatus } : c)
    );
    // TODO: implement actual OAuth/connection flow
    setTimeout(() => {
      setConnectors(prev =>
        prev.map(c => c.id === id ? { ...c, status: 'connected' as ConnectionStatus } : c)
      );
    }, 1500);
  };

  const handleDisconnect = (id: string) => {
    setConnectors(prev =>
      prev.map(c => c.id === id ? { ...c, status: 'disconnected' as ConnectionStatus } : c)
    );
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-claude-accent/10 rounded-xl">
            <Plug size={22} className="text-claude-accent" />
          </div>
          <h1 className="text-xl font-semibold text-claude-text font-sans tracking-tight">
            MCP конект
          </h1>
        </div>
        <p className="text-[13px] text-claude-subtext font-sans mb-8 ml-[46px]">
          Підключіть зовнішні сервіси для роботи з документами
        </p>

        <div className="space-y-4">
          {connectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              onConnect={() => handleConnect(connector.id)}
              onDisconnect={() => handleDisconnect(connector.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConnectorCard({
  connector,
  onConnect,
  onDisconnect,
}: {
  connector: Connector;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { name, description, icon, status } = connector;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-claude-border p-5 flex items-center gap-4"
    >
      <div className="w-10 h-10 rounded-xl bg-claude-bg flex items-center justify-center shrink-0">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-claude-text font-sans">{name}</span>
          <StatusBadge status={status} />
        </div>
        <p className="text-[12px] text-claude-subtext font-sans mt-0.5">{description}</p>
      </div>

      <div className="shrink-0">
        {status === 'connected' ? (
          <button
            onClick={onDisconnect}
            className="px-4 py-2 text-[12px] font-medium text-claude-subtext bg-claude-bg hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors font-sans"
          >
            Від'єднати
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={status === 'connecting'}
            className="px-4 py-2 text-[12px] font-medium text-white bg-claude-accent hover:bg-[#C66345] disabled:opacity-50 rounded-lg transition-colors font-sans flex items-center gap-1.5"
          >
            {status === 'connecting' ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Cloud size={14} />
                </motion.div>
                З'єднання...
              </>
            ) : (
              <>
                <ExternalLink size={14} />
                Підключити
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 rounded-full font-sans">
        <CheckCircle2 size={10} />
        Підключено
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-red-700 bg-red-50 rounded-full font-sans">
        <AlertCircle size={10} />
        Помилка
      </span>
    );
  }
  return null;
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
