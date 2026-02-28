import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, MessageSquare, Clock, Search } from 'lucide-react';
import { consultationService, type AttorneyClient } from '../../services/api/ConsultationService';
import { ROUTES } from '../../router/routes';

export function AttorneyClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<AttorneyClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    consultationService.getMyClients()
      .then(data => setClients(data.clients))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? clients.filter(c =>
        c.client_name.toLowerCase().includes(search.toLowerCase()) ||
        c.client_email.toLowerCase().includes(search.toLowerCase())
      )
    : clients;

  const handleClientClick = (clientUserId: string) => {
    navigate(`${ROUTES.CONSULTATIONS}?clientId=${clientUserId}`);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-claude-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Мої клієнти</h1>
            <p className="text-[13px] text-gray-500 mt-1">
              {clients.length} {clients.length === 1 ? 'клієнт' : clients.length < 5 ? 'клієнти' : 'клієнтів'}
            </p>
          </div>
        </div>

        {/* Search */}
        {clients.length > 0 && (
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Пошук клієнтів..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all"
            />
          </div>
        )}

        {/* Empty state */}
        {clients.length === 0 && (
          <div className="text-center py-16">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-[15px] font-medium text-gray-600 mb-1">Поки немає клієнтів</h3>
            <p className="text-[13px] text-gray-400">Клієнти з'являться після прийняття запитів на консультації</p>
          </div>
        )}

        {/* Client list */}
        <div className="space-y-2">
          {filtered.map(client => (
            <button
              key={client.client_user_id}
              onClick={() => handleClientClick(client.client_user_id)}
              className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                {client.client_picture ? (
                  <img src={client.client_picture} alt={client.client_name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-claude-accent/10 flex items-center justify-center text-claude-accent text-[13px] font-semibold">
                    {client.client_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-gray-900 group-hover:text-claude-accent transition-colors">
                    {client.client_name}
                  </div>
                  <div className="text-[12px] text-gray-500 truncate">{client.client_email}</div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-[12px] text-gray-500">
                  <span className="flex items-center gap-1" title="Всього консультацій">
                    <MessageSquare size={14} />
                    {client.total_consultations}
                  </span>
                  {Number(client.active_consultations) > 0 && (
                    <span className="flex items-center gap-1 text-green-600" title="Активних">
                      <Users size={14} />
                      {client.active_consultations}
                    </span>
                  )}
                  <span className="flex items-center gap-1" title="Остання консультація">
                    <Clock size={14} />
                    {new Date(client.last_consultation_at).toLocaleDateString('uk-UA')}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {filtered.length === 0 && clients.length > 0 && (
          <div className="text-center py-8">
            <p className="text-[13px] text-gray-400">Нічого не знайдено</p>
          </div>
        )}
      </div>
    </div>
  );
}
