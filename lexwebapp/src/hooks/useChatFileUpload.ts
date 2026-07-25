import { useCallback } from 'react';
import { uploadService } from '../services/api/UploadService';
import { getErrorMessage } from '../utils/errors';
import type { SelectedFile } from '../components/chat/FileAttachments';

/**
 * Handles file upload flow for chat attachments.
 * Extracted from ChatInput to separate upload concerns from UI logic.
 * Uses server-defined chunk size (fixes single-chunk-whole-file bug).
 */
export function useChatFileUpload(
  setFiles: React.Dispatch<React.SetStateAction<SelectedFile[]>>
) {
  return useCallback(async (selectedFiles: SelectedFile[]): Promise<string[]> => {
    const documentIds: string[] = [];
    const tracked = [...selectedFiles];

    for (let i = 0; i < tracked.length; i++) {
      tracked[i] = { ...tracked[i], uploading: true };
      setFiles([...tracked]);

      try {
        const init = await uploadService.initUpload({
          fileName: tracked[i].file.name,
          fileSize: tracked[i].file.size,
          mimeType: tracked[i].file.type || 'application/octet-stream',
          docType: 'other',
        });

        const { uploadId, chunkSize, totalChunks } = init;
        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
          const start = chunkIdx * chunkSize;
          const chunk = tracked[i].file.slice(start, Math.min(start + chunkSize, tracked[i].file.size));
          await uploadService.uploadChunk(uploadId, chunkIdx, chunk);
        }

        await uploadService.completeUpload(uploadId);

        let attempts = 0;
        let status = await uploadService.getStatus(uploadId);
        while (status.status !== 'completed' && status.status !== 'failed' && attempts < 30) {
          await new Promise((r) => setTimeout(r, 1000));
          status = await uploadService.getStatus(uploadId);
          attempts++;
        }

        if (status.documentId) {
          documentIds.push(status.documentId);
          tracked[i] = { ...tracked[i], uploading: false, documentId: status.documentId };
        } else {
          tracked[i] = { ...tracked[i], uploading: false, error: 'Завантаження не вдалось' };
        }
      } catch (err: unknown) {
        tracked[i] = { ...tracked[i], uploading: false, error: getErrorMessage(err) };
      }

      setFiles([...tracked]);
    }

    return documentIds;
  }, [setFiles]);
}
