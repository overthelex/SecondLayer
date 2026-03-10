import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../router/routes';
import showToast from '../../utils/toast';
import {
  Plus, MessageSquare, X, Edit3, Trash2,
  ChevronsUpDown, Archive, Folder, FolderOpen,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useChatStore } from '../../stores/chatStore';
import { api } from '../../utils/api-client';
import type { UserRole } from '../../types/models/User';

import { NavItem } from './NavItem';
import { Section } from './Section';
import { SidebarFooter } from './SidebarFooter';
import {
  researchSections, legislationSections, getMattersSections,
  externalSourcesSections, monitoringSections,
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
    new Set(['conversations', 'research', 'legislation', 'vault', 'matters', 'external-sources', 'monitoring'])
  );
  const [vaultFolders, setVaultFolders] = useState<string[]>([]);
  const [vaultFoldersLoaded, setVaultFoldersLoaded] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
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
    const ids = ['research', 'legislation', 'vault', 'matters'];
    if (conversations.length > 0) ids.push('conversations');
    return ids;
  }, [role, conversations.length]);

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
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl border border-claude-border shadow-xl p-6 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[15px] font-semibold text-claude-text mb-2">Видалити папку?</h3>
              <p className="text-[13px] text-claude-subtext mb-4">
                Всі документи в папці <strong>{deletingFolder}</strong> будуть видалені. Цю дію можна скасувати через відновлення документів.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeletingFolder(null)} className="px-4 py-2 text-[13px] font-medium text-claude-text bg-claude-bg hover:bg-claude-subtext/10 rounded-lg transition-colors">Скасувати</button>
                <button onClick={() => handleDeleteFolder(deletingFolder)} className="px-4 py-2 text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">Видалити</button>
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
          className="fixed inset-0 bg-black/25 z-40 lg:hidden backdrop-blur-[2px]" />
        }
      </AnimatePresence>

      {/* Sidebar Container */}
      <aside className={`fixed lg:static inset-y-0 left-0 lg:inset-auto z-50 w-[280px] h-screen lg:h-full bg-claude-sidebar border-r border-claude-border flex flex-col transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>

        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-claude-border/50">
          <div className="flex items-center gap-3 px-1">
            <div className="h-16 flex items-center">
              <img src="/Image.jpg" alt="Lex" className="h-full w-auto object-contain" />
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-subtext/8 rounded-lg transition-all duration-200">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-4 pb-3">
          <button onClick={handleNewChat} className="w-full flex items-center gap-3 px-4 py-2.5 bg-white border border-claude-border hover:bg-claude-bg hover:border-claude-subtext/30 rounded-[12px] text-claude-text shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 group active:scale-[0.98]">
            <div className="p-1 bg-claude-subtext/10 rounded-full group-hover:bg-claude-subtext/15 transition-colors duration-200">
              <Plus size={15} strokeWidth={2.5} className="text-claude-text" />
            </div>
            <span className="font-medium text-[13px] tracking-tight font-sans">Новий запит</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-3 py-1">
          <div className="flex justify-end px-1 py-1">
            <button onClick={toggleAllSections} title={allCollapsed ? 'Розгорнути все' : 'Згорнути все'}
              className="p-1.5 text-claude-subtext/50 hover:text-claude-text hover:bg-claude-subtext/8 rounded-lg transition-all duration-200">
              <ChevronsUpDown size={14} strokeWidth={2} />
            </button>
          </div>

          {/* NON-ADMIN MENU */}
          {role !== 'administrator' && (
            <>
              {conversations.length > 0 && (
                <Section id="conversations" title="Розмови" collapsed={collapsedSections.has('conversations')} onToggle={toggleSection}>
                  <div className="max-h-[280px] overflow-y-auto space-y-0.5">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] cursor-pointer transition-all duration-200 ${
                          activeConversationId === conv.id ? 'bg-claude-accent/10 text-claude-accent' : 'text-claude-text hover:bg-claude-subtext/8'
                        } ${switchingId === conv.id ? 'opacity-60 pointer-events-none' : ''}`}
                        onClick={() => handleSwitchConversation(conv.id)}>
                        <MessageSquare size={14} strokeWidth={2} className="flex-shrink-0 opacity-60" />
                        {editingId === conv.id ? (
                          <input
                            className="flex-1 min-w-0 bg-white border border-claude-border rounded px-1 py-0.5 text-[13px] outline-none"
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
                          <span className="flex-1 truncate font-medium tracking-tight font-sans">{conv.title}</span>
                        )}
                        {switchingId === conv.id ? (
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0 opacity-50" />
                        ) : (
                          <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); setEditingId(conv.id); setEditTitle(conv.title); }} className="p-1 hover:bg-claude-subtext/15 rounded transition-colors"><Edit3 size={12} /></button>
                            <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} className="p-1 hover:bg-red-100 text-red-500 rounded transition-colors"><Trash2 size={12} /></button>
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
                    <div key={folder} className={`flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 group cursor-pointer ${isActive ? 'bg-claude-accent/10 text-claude-accent' : 'text-claude-text hover:bg-claude-subtext/8'}`} onClick={() => handleNavigation(folderRoute)}>
                      {isActive ? <FolderOpen size={15} strokeWidth={2} className="text-claude-accent flex-shrink-0" /> : <Folder size={15} strokeWidth={2} className="text-claude-subtext/60 group-hover:text-claude-text transition-colors duration-200 flex-shrink-0" />}
                      <span className="flex-1 truncate font-medium tracking-tight font-sans">{folder}</span>
                      <button onClick={(e) => { e.stopPropagation(); setDeletingFolder(folder); }} className="hidden group-hover:flex p-1 hover:bg-red-100 text-red-500 rounded transition-colors flex-shrink-0"><Trash2 size={12} /></button>
                    </div>
                  );
                })}
              </Section>

              <Section id="matters" title="Справи" collapsed={collapsedSections.has('matters')} onToggle={toggleSection}>
                {mattersSections.map((s) => (
                  <NavItem key={s.id} icon={s.icon} label={s.label} route={s.route} onClick={() => handleNavigation(s.route)} />
                ))}
              </Section>

              <div className="mb-6">
                <NavItem icon={Zap} label="Workflows" route={ROUTES.WORKFLOWS} onClick={() => handleNavigation(ROUTES.WORKFLOWS)} />
              </div>

              {/* Attorney section hidden — feature not ready for production */}
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
