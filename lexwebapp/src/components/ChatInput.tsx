import { useEffect, useState, useRef } from 'react';
import { Send, Plus, Square, Loader2 } from 'lucide-react';
import showToast from '../utils/toast';
import { toastT } from '../i18n/toast-i18n';
import { FileAttachments, SelectedFile } from './chat/FileAttachments';
import { PromptManager } from './chat/PromptManager';
import { useChatFileUpload } from '../hooks/useChatFileUpload';
import { useAupConsent } from '../hooks/useAupConsent';
import { AupConsentModal } from './AupConsentModal';
import { useChatStore } from '../stores';

const ACCEPTED_FILE_TYPES = '.pdf,.docx,.doc,.txt,.rtf,.html';

interface ChatInputProps {
  onSend: (message: string, toolName?: string, documentIds?: string[]) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  hasQueuedQuery?: boolean;
  onCancel?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  isStreaming,
  hasQueuedQuery,
  onCancel,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [showAupModal, setShowAupModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { accepted: aupAccepted, accept: acceptAup } = useAupConsent();

  // Consume draft input from store (e.g. from selection toolbar)
  const draftInput = useChatStore(s => s.draftInput);
  const setDraftInput = useChatStore(s => s.setDraftInput);

  useEffect(() => {
    if (draftInput !== null) {
      setInput(draftInput);
      setDraftInput(null);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [draftInput, setDraftInput]);

  const uploadFiles = useChatFileUpload(setFiles);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [input]);

  const handleSubmit = async () => {
    if ((!input.trim() && files.length === 0) || disabled) return;

    let documentIds: string[] = [];

    if (files.length > 0) {
      setIsUploadingFiles(true);
      try {
        documentIds = await uploadFiles(files);
      } catch {
        showToast.error(toastT('uploadFilesError'));
      }
      setIsUploadingFiles(false);
    }

    onSend(input, undefined, documentIds.length > 0 ? documentIds : undefined);
    setInput('');
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const addFilesToState = (rawFiles: File[]) => {
    const newFiles: SelectedFile[] = rawFiles.map((file) => ({
      file,
      uploading: false,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    if (!aupAccepted) {
      // Store files and show AUP modal
      setPendingFiles(selectedFiles);
      setShowAupModal(true);
    } else {
      addFilesToState(selectedFiles);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAupAccept = () => {
    acceptAup();
    setShowAupModal(false);
    if (pendingFiles.length > 0) {
      addFilesToState(pendingFiles);
      setPendingFiles([]);
    }
  };

  const handleAupCancel = () => {
    setShowAupModal(false);
    setPendingFiles([]);
  };

  const handleLoadPrompt = (content: string) => {
    setInput(content);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <>
    <AupConsentModal
      isOpen={showAupModal}
      onAccept={handleAupAccept}
      onCancel={handleAupCancel}
    />
    <div className="max-w-3xl mx-auto px-4 md:px-8 pb-2" data-tour="chat-input">
      {/* File Badges */}
      <FileAttachments files={files} onRemove={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))} />

      {/* Load / Save prompt buttons */}
      <PromptManager currentInput={input} onLoadPrompt={handleLoadPrompt} />

      <div className="relative bg-white rounded-2xl border border-zinc-200/80 shadow-sm focus-within:shadow-md focus-within:border-zinc-300 transition-all duration-200">
        <div className="flex items-end gap-1 p-2">
          {/* Plus / Attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors duration-150 flex-shrink-0"
            aria-label="Додати вкладення"
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            id="chat-message-input"
            name="message"
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишіть повідомлення..."
            disabled={disabled}
            rows={1}
            className="flex-1 py-2.5 px-1 bg-transparent border-none resize-none focus:ring-0 focus:outline-none text-zinc-900 placeholder:text-zinc-400 font-sans text-[14px] leading-[1.6] max-h-[200px] overflow-hidden"
            style={{
              minHeight: '40px'
            }}
          />

          <div className="flex items-center gap-1.5 flex-shrink-0 pb-0.5">
            {isStreaming && (
              <button
                type="button"
                onClick={onCancel}
                className="p-2 rounded-xl transition-all duration-150 bg-zinc-900 text-white hover:bg-zinc-700 active:scale-95"
                aria-label="Зупинити генерацію"
                title="Зупинити"
              >
                <Square size={14} strokeWidth={2} fill="currentColor" />
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={(!input.trim() && files.length === 0) || disabled || isUploadingFiles}
              className={`p-2 rounded-xl transition-all duration-150 ${
                (input.trim() || files.length > 0) && !disabled && !isUploadingFiles
                  ? 'bg-zinc-900 text-white hover:bg-zinc-700 active:scale-95 shadow-sm'
                  : 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
              }`}
              aria-label={isStreaming ? 'Додати в чергу' : 'Надіслати повідомлення'}
              title={isStreaming ? 'Буде виконано після поточної відповіді' : undefined}
            >
              {isUploadingFiles ? (
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              ) : (
                <Send size={14} strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Queued query indicator */}
      {hasQueuedQuery && (
        <div className="mt-1.5 px-3 py-1 text-[11px] text-zinc-500 flex items-center gap-1.5">
          <Loader2 size={10} className="animate-spin" />
          <span>Запит в черзі — буде виконано після поточної відповіді</span>
        </div>
      )}
    </div>
    </>
  );
}
