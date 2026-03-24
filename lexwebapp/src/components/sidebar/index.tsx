import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../router/routes';
import showToast from '../../utils/toast';
import {
  Plus, MessageSquare, X, Edit3, Trash2,
  ChevronsUpDown, Archive, Folder, FolderOpen,
  Zap, Briefcase, Users, Search,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useChatStore } from '../../stores/chatStore';
import { useConsultationStore } from '../../stores/consultationStore';
import { api } from '../../utils/api-client';
import type { UserRole } from '../../types/models/User';

import { NavItem } from './NavItem';
import { Section } from './Section';
import { SidebarFooter } from './SidebarFooter';
import {
  researchSections, legislationSections, getMattersSections,
  developerSections, externalSourcesSections, monitoringSections,
} from './nav-config';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}

export function Sidebar({ isOpen, onClose, onLogout }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const role: UserRole = user?.role || 'user';
  const isAttorney = user?.userType === 'attorney';
  const mattersSections = getMattersSections(isAttorney);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(['conversations', 'research', 'legislation', 'vault', 'matters', 'attorneys', 'developer', 'external-sources', 'monitoring'])
  );
  const [vaultFolders, setVaultFolders] = useState<string[]>([]);
  const [vaultFoldersLoaded, setVaultFoldersLoaded] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const pendingCount = useConsultationStore(s => s.pendingCount);
  const globalUnreadCount = useConsultationStore(s => s.globalUnreadCount);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const conversations = useChatStore(s => s.conversations);
  const activeConversationId = useChatStore(s => s.conversationId);
  const loadConversations = useChatStore(s => s.loadConversations);
  const switchConversation = useChatStore(s => s.switchConversation);
  const deleteConversation = useChatStore(s => s.deleteConversation);
  const renameConversation = useChatStore(s => s.renameConversation);
  const newConversation = useChatStore(s => s.newConversation);

  const renderedSectionIds = useMemo(() => {
    if (role === 'administrator') return ['external-sources', 'monitoring'];
    const ids = ['research', 'legislation', 'vault', 'matters', 'attorneys', 'developer'];
    if (conversations.length > 0) ids.push('conversations');
    return ids;
  }, [role, conversations.length]);

  const expandSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      if (!prev.has(sectionId)) return prev;
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const toggleAllSections = () => {
    const allCollapsed = renderedSectionIds.every(id => collapsedSections.has(id));
    if (allCollapsed) setCollapsedSections(new Set());
    else setCollapsedSections(new Set(renderedSectionIds));
  };

  const allCollapsed = renderedSectionIds.length > 0 && renderedSectionIds.every(id => collapsedSections.has(id));

  useEffect(() => { loadConversations(); }, []);

  useEffect(() => {
    if (!collapsedSections.has('vault') && !vaultFoldersLoaded) {
      api.documents.getFolders()
        .then((resp) => { setVaultFolders(resp.data.folders || []); setVaultFoldersLoaded(true); })
        .catch(() => { setVaultFolders([]); setVaultFoldersLoaded(true); });
    }
  }, [collapsedSections, vaultFoldersLoaded]);

  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener('sidebar-navigate', handler);
    return () => window.removeEventListener('sidebar-navigate', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: Event) => {
      const sectionId = (e as CustomEvent).detail;
      if (sectionId) expandSection(sectionId);
    };
    window.addEventListener('tour-expand-section', handler);
    return () => window.removeEventListener('tour-expand-section', handler);
  }, []);

  useEffect(() => {
    const handler = () => { setVaultFoldersLoaded(false); expandSection('vault'); };
    window.addEventListener('vault-folders-changed', handler);
    return () => window.removeEventListener('vault-folders-changed', handler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleNavigation = (route: string) => {
    navigate(route);
    if (window.innerWidth < 1024) onClose();
  };

  const handleNewChat = () => {
    newConversation();
    navigate(ROUTES.CHAT);
    if (window.innerWidth < 1024) onClose();
  };

  const handleSwitchConversation = async (convId: string) => {
    if (switchingId) return;
    setSwitchingId(convId);
    try {
      await switchConversation(convId);
      if (location.pathname !== ROUTES.CHAT) navigate(ROUTES.CHAT);
    } finally {
      setSwitchingId(null);
      if (window.innerWidth < 1024) onClose();
    }
  };

  const handleDeleteFolder = async (folder: string) => {
    try {
      await api.documents.deleteFolder(folder);
      setDeletingFolder(null);
      setVaultFoldersLoaded(false);
      showToast.success('Папку видалено');
    } catch {
      showToast.error('Не вдалося видалити папку');
    }
  };

  return (
    <>
      {/* Folder Delete Confirmation */}
      <AnimatePresence>
        {deletingFolder && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center backdrop-blur-[2px]"
            onClick={() => setDeletingFolder(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="bg-[#1a1a1a] rounded-xl border border-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.6)] p-6 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[14px] font-semibold text-zinc-200 mb-2 tracking-[-0.01em]">Видалити папку?</h3>
              <p className="text-[12.5px] text-zinc-500 mb-5 leading-relaxed">
                Всі документи в папці <strong className="text-zinc-300 font-medium">{deletingFolder}</strong> будуть видалені. Цю дію можна скасувати через відновлення документів.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeletingFolder(null)} className="px-3.5 py-1.5 text-[12.5px] font-medium text-zinc-400 hover:text-zinc-200 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.06] rounded-md transition-colors">Скасувати</button>
                <button onClick={() => handleDeleteFolder(deletingFolder)} className="px-3.5 py-1.5 text-[12.5px] font-medium text-white bg-red-500/80 hover:bg-red-500 rounded-md transition-colors">Видалити</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen &&
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-[3px]" />
        }
      </AnimatePresence>

      {/* Sidebar Container */}
      <aside className={`fixed lg:static inset-y-0 left-0 lg:inset-auto z-50 w-[252px] h-screen lg:h-full bg-[#111111] border-r border-white/[0.06] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 px-1">
            <div className="h-9 flex items-center">
              <img src="/Image.jpg" alt="Lex" className="h-full w-auto object-contain opacity-90" />
            </div>
            {(import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_APP_FRONTEND_VERSION) && (
              <div className="flex flex-col leading-tight">
                {import.meta.env.VITE_APP_VERSION && (
                  <span className="text-[8px] text-zinc-700 font-mono tracking-tight">
                    be {import.meta.env.VITE_APP_VERSION}
                  </span>
                )}
                {import.meta.env.VITE_APP_FRONTEND_VERSION && (
                  <span className="text-[8px] text-zinc-700 font-mono tracking-tight">
                    fe {import.meta.env.VITE_APP_FRONTEND_VERSION}
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.05] rounded-md transition-colors duration-150">
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 pb-4">
          <button onClick={handleNewChat} className="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.07] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.10] hover:text-white rounded-md text-[12.5px] font-medium transition-all duration-150 group active:scale-[0.99] tracking-[-0.01em]">
            <Plus size={13} strokeWidth={2} className="text-zinc-500 group-hover:text-zinc-300 transition-colors duration-150" />
            <span className="font-sans">Новий запит</span>
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 mb-3 border-t border-white/[0.05]" />

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-2.5 py-0 scrollbar-hide">
          <div className="flex justify-end px-1 py-0.5 mb-1">
            <button onClick={toggleAllSections} title={allCollapsed ? 'Розгорнути все' : 'Згорнути все'}
              className="p-1 text-zinc-800 hover:text-zinc-600 rounded transition-colors duration-150">
              <ChevronsUpDown size={12} strokeWidth={2} />
            </button>
          </div>

          {/* NON-ADMIN MENU */}
          {role !== 'administrator' && (
            <>
              {conversations.length > 0 && (
                <Section id="conversations" title="Розмови" collapsed={collapsedSections.has('conversations')} onToggle={toggleSection}>
                  <div className="max-h-[280px] overflow-y-auto space-y-0.5 scrollbar-hide">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-2 pl-3 pr-2 py-[7px] rounded-md text-[12.5px] cursor-pointer transition-all duration-150 relative ${
                          activeConversationId === conv.id
                            ? 'bg-white/[0.07] text-white'
                            : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                        } ${switchingId === conv.id ? 'opacity-50 pointer-events-none' : ''}`}
                        onClick={() => handleSwitchConversation(conv.id)}>
                        {activeConversationId === conv.id && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full bg-white opacity-60" />
                        )}
                        <MessageSquare size={12} strokeWidth={1.75} className={`flex-shrink-0 transition-colors duration-150 ${activeConversationId === conv.id ? 'text-zinc-400' : 'text-zinc-700 group-hover:text-zinc-500'}`} />
                        {editingId === conv.id ? (
                          <input
                            className="flex-1 min-w-0 bg-white/[0.08] border border-white/[0.12] rounded px-1.5 py-0.5 text-[12px] text-zinc-200 outline-none"
                            value={editTitle}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { renameConversation(conv.id, editTitle); setEditingId(null); }
                              else if (e.key === 'Escape') setEditingId(null);
                            }}
                            onBlur={() => { renameConversation(conv.id, editTitle); setEditingId(null); }}
                            autoFocus
                          />
                        ) : (
                          <span className={`flex-1 truncate tracking-[-0.01em] font-sans ${activeConversationId === conv.id ? 'font-medium text-zinc-200' : 'font-normal'}`}>{conv.title}</span>
                        )}
                        {switchingId === conv.id ? (
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin flex-shrink-0 opacity-40" />
                        ) : (
                          <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); setEditingId(conv.id); setEditTitle(conv.title); }} className="p-1 hover:bg-white/[0.08] text-zinc-600 hover:text-zinc-400 rounded transition-colors"><Edit3 size={11} /></button>
                            <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} className="p-1 hover:bg-red-500/10 text-zinc-700 hover:text-red-400 rounded transition-colors"><Trash2 size={11} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section id="research" title="Дослідження" collapsed={collapsedSections.has('research')} onToggle={toggleSection}>
                {researchSections.map((s) => (
                  <NavItem key={s.id} icon={s.icon} label={s.label} route={s.route} onClick={() => handleNavigation(s.route)} />
                ))}
              </Section>

              <Section id="legislation" title="Законодавство" collapsed={collapsedSections.has('legislation')} onToggle={toggleSection}>
                {legislationSections.map((s) => (
                  <NavItem key={s.id} icon={s.icon} label={s.label} route={s.route} onClick={() => handleNavigation(s.route)} />
                ))}
              </Section>

              <Section id="vault" title="Vault" collapsed={collapsedSections.has('vault')} onToggle={toggleSection}>
                <NavItem icon={Archive} label="Всі документи" route={ROUTES.DOCUMENTS} onClick={() => handleNavigation(ROUTES.DOCUMENTS)} />
                {vaultFolders.map((folder) => {
                  const folderRoute = `/documents/folders/${folder}`;
                  const isActive = location.pathname === folderRoute || location.pathname.startsWith(folderRoute + '/');
                  return (
                    <div
                      key={folder}
                      className={`relative flex items-center gap-2.5 pl-3 pr-2 py-[7px] rounded-md text-[12.5px] transition-all duration-150 group cursor-pointer ${
                        isActive
                          ? 'bg-white/[0.07] text-white'
                          : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                      }`}
                      onClick={() => handleNavigation(folderRoute)}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full bg-white opacity-60" />
                      )}
                      {isActive
                        ? <FolderOpen size={13} strokeWidth={1.75} className="text-zinc-400 flex-shrink-0" />
                        : <Folder size={13} strokeWidth={1.75} className="text-zinc-700 group-hover:text-zinc-500 transition-colors duration-150 flex-shrink-0" />
                      }
                      <span className={`flex-1 truncate tracking-[-0.01em] font-sans ${isActive ? 'font-medium text-zinc-200' : 'font-normal'}`}>{folder}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingFolder(folder); }}
                        className="hidden group-hover:flex p-1 hover:bg-red-500/10 text-zinc-700 hover:text-red-400 rounded transition-colors flex-shrink-0"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </Section>

              <Section id="matters" title="Справи" collapsed={collapsedSections.has('matters')} onToggle={toggleSection}>
                {mattersSections.map((s) => (
                  <NavItem key={s.id} icon={s.icon} label={s.label} route={s.route} onClick={() => handleNavigation(s.route)} />
                ))}
              </Section>

              <Section id="attorneys" title={isAttorney ? 'Консультації' : 'Адвокати'} collapsed={collapsedSections.has('attorneys')} onToggle={toggleSection}>
                {!isAttorney && (
                  <NavItem icon={Search} label="Знайти адвоката" route={ROUTES.ATTORNEYS} onClick={() => handleNavigation(ROUTES.ATTORNEYS)} />
                )}
                <NavItem icon={Briefcase} label="Мої консультації" route={ROUTES.CONSULTATIONS} onClick={() => handleNavigation(ROUTES.CONSULTATIONS)} badge={(pendingCount + globalUnreadCount) > 0 ? pendingCount + globalUnreadCount : undefined} />
                {isAttorney && (
                  <NavItem icon={Users} label="Мої клієнти" route={ROUTES.ATTORNEY_CLIENTS} onClick={() => handleNavigation(ROUTES.ATTORNEY_CLIENTS)} />
                )}
              </Section>

              <div className="mb-2 mt-1">
                <NavItem icon={Zap} label="Workflows" route={ROUTES.WORKFLOWS} onClick={() => handleNavigation(ROUTES.WORKFLOWS)} />
              </div>

              <Section id="developer" title="Розробникам" collapsed={collapsedSections.has('developer')} onToggle={toggleSection}>
                {developerSections.map((s) => (
                  <NavItem key={s.id} icon={s.icon} label={s.label} route={s.route} onClick={() => handleNavigation(s.route)} />
                ))}
              </Section>
            </>
          )}

          {/* ADMIN MENU */}
          {role === 'administrator' && (
            <>
              <Section id="external-sources" title="Зовнішні джерела" collapsed={collapsedSections.has('external-sources')} onToggle={toggleSection}>
                {externalSourcesSections.map((s) => (
                  <NavItem key={s.id} icon={s.icon} label={s.label} route={s.route} onClick={() => handleNavigation(s.route)} />
                ))}
              </Section>

              <Section id="monitoring" title="Моніторинг" collapsed={collapsedSections.has('monitoring')} onToggle={toggleSection}>
                {monitoringSections.map((s) => (
                  <NavItem key={s.id} icon={s.icon} label={s.label} route={s.route} onClick={() => handleNavigation(s.route)} />
                ))}
              </Section>
            </>
          )}
        </div>

        <SidebarFooter
          user={user}
          role={role}
          showProfileMenu={showProfileMenu}
          profileMenuRef={profileMenuRef}
          onProfileMenuClick={() => setShowProfileMenu(!showProfileMenu)}
          onProfileClick={() => { setShowProfileMenu(false); navigate(ROUTES.PROFILE); }}
          onLogout={() => { setShowProfileMenu(false); if (onLogout) onLogout(); }}
        />
      </aside>
    </>
  );
}
