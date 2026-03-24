import { useEffect, useState, useRef } from 'react';
import { Send, Plus, Square, Loader2 } from 'lucide-react';
import showToast from '../utils/toast';
import { toastT } from '../i18n/toast-i18n';
import { ToolSelector } from './chat/ToolSelector';
import { FileAttachments, SelectedFile } from './chat/FileAttachments';
import { PromptManager } from './chat/PromptManager';
import { useChatFileUpload } from '../hooks/useChatFileUpload';

const ACCEPTED_FILE_TYPES = '.pdf,.docx,.doc,.txt,.rtf,.html';

interface ChatInputProps {
  onSend: (message: string, toolName?: string, documentIds?: string[]) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onCancel?: () => void;
  selectedTool?: string;
  onToolChange?: (tool: string) => void;
}

export function ChatInput({
  onSend,
  disabled,
  isStreaming,
  onCancel,
  selectedTool,
  onToolChange,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if ((!input.trim() && files.length === 0) || disabled || isStreaming) return;

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const newFiles: SelectedFile[] = selectedFiles.map((file) => ({
      file,
      uploading: false,
    }));
    setFiles((prev) => [...prev, ...newFiles]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleLoadPrompt = (content: string) => {
    setInput(content);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <>
    <div className="max-w-3xl mx-auto px-4 md:px-8 pb-2" data-tour="chat-input">
      {/* Mode Selection */}
      {onToolChange && selectedTool && (
        <ToolSelector selectedTool={selectedTool} onToolChange={onToolChange} />
      )}

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
            disabled={disabled || isStreaming}
            rows={1}
            className="flex-1 py-2.5 px-1 bg-transparent border-none resize-none focus:ring-0 focus:outline-none text-zinc-900 placeholder:text-zinc-400 font-sans text-[14px] leading-[1.6] max-h-[200px] overflow-hidden"
            style={{
              minHeight: '40px'
            }}
          />

          <div className="flex items-center gap-1.5 flex-shrink-0 pb-0.5">
            {isStreaming ? (
              <button
                type="button"
                onClick={onCancel}
                className="p-2 rounded-xl transition-all duration-150 bg-zinc-900 text-white hover:bg-zinc-700 active:scale-95"
                aria-label="Зупинити генерацію"
                title="Зупинити"
              >
                <Square size={14} strokeWidth={2} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={(!input.trim() && files.length === 0) || disabled || isUploadingFiles}
                className={`p-2 rounded-xl transition-all duration-150 ${
                  (input.trim() || files.length > 0) && !disabled && !isUploadingFiles
                    ? 'bg-zinc-900 text-white hover:bg-zinc-700 active:scale-95 shadow-sm'
                    : 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                }`}
                aria-label="Надіслати повідомлення"
              >
                {isUploadingFiles ? (
                  <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Send size={14} strokeWidth={2} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
