import { LucideIcon } from 'lucide-react';
import { BillingBalance } from '../../types/models';

export interface EditFormState {
  name: string;
  phone: string;
  picture: string;
}

export interface StatItem {
  label: string;
  value: string;
  icon: LucideIcon;
}

export interface SettingsItem {
  icon: LucideIcon;
  label: string;
  value: string;
  onClick?: () => void;
}

export interface SettingsGroup {
  title: string;
  items: SettingsItem[];
}

export interface UseProfileReturn {
  // Auth
  user: any;
  isLoading: boolean;

  // Billing
  billing: BillingBalance | null;

  // Edit form
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  isEditModalOpen: boolean;
  isSaving: boolean;
  isUploadingPhoto: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // WebAuthn
  webauthnCredentials: any[];
  isRegisteringKey: boolean;
  isDeletingKey: string | null;

  // MCP Tokens
  mcpTokens: any[];
  isCreatingToken: boolean;
  isTokenModalOpen: boolean;
  setIsTokenModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newTokenName: string;
  setNewTokenName: React.Dispatch<React.SetStateAction<string>>;
  revealedToken: string | null;
  setRevealedToken: React.Dispatch<React.SetStateAction<string | null>>;
  copiedToken: boolean;
  isDeletingToken: string | null;

  // Handlers
  handleEditProfile: () => void;
  handleCloseModal: () => void;
  handleSaveProfile: () => Promise<void>;
  handlePhotoClick: () => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleShare: () => void;
  handleRegisterPasskey: (attachment?: 'cross-platform') => Promise<void>;
  handleDeleteCredential: (credentialId: string) => Promise<void>;
  handleCreateMcpToken: () => Promise<void>;
  handleRevokeMcpToken: (keyId: string) => Promise<void>;
  handleCopyToken: (text: string) => void;

  // Computed
  stats: StatItem[];
  settingsGroups: SettingsGroup[];
}
