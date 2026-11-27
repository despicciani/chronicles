import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { openAlertDialog } from './PromptDialog';

interface FileUploadButtonProps {
  accept: string;
  label: string;
  onUploaded: (url: string, filename: string) => void;
  className?: string;
}

export const FileUploadButton: React.FC<FileUploadButtonProps> = ({
  accept,
  label,
  onUploaded,
  className = '',
}) => {
  const { serverUrl } = useCampaign();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isAudio = accept.includes('audio') || file.type.startsWith('audio/');
    setUploading(true);
    try {
      const base = (serverUrl || '').replace(/\/+$/, '');
      // 1. Primary fast binary upload (zero base64 bloat, supports up to 120MB MP3/WAV/OGG & HD maps)
      try {
        const rawRes = await fetch(`${base}/api/upload-raw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name),
          },
          body: file,
        });
        if (rawRes.ok) {
          const data = (await rawRes.json()) as { url: string; filename: string };
          onUploaded(data.url, data.filename);
          return;
        }
      } catch {
        // Fallback to JSON upload below
      }

      // 2. Legacy base64 JSON upload fallback
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo do PC.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch(`${base}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataUrl }),
      });
      if (res.ok) {
        const data = (await res.json()) as { url: string; filename: string };
        onUploaded(data.url, data.filename);
        return;
      }

      // Never silently embed huge base64 audio into campaignState (it exceeds WebSocket limits and fails to persist!)
      if (isAudio || file.size > 4 * 1024 * 1024) {
        await openAlertDialog(
          `Não foi possível enviar "${file.name}" ao servidor (HTTP ${res.status}). Verifique se o servidor está conectado ou tente um arquivo menor.`,
          'Erro ao Salvar Arquivo'
        );
        return;
      }
      onUploaded(dataUrl, file.name);
    } catch (err) {
      if (isAudio || file.size > 4 * 1024 * 1024) {
        await openAlertDialog(
          `Não foi possível salvar "${file.name}" no servidor (${String(err)}). Verifique a conexão com a mesa.`,
          'Erro ao Salvar Arquivo'
        );
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`rpg-card px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:opacity-90 disabled:opacity-50 ${className}`}
      >
        <Upload className="w-3.5 h-3.5" />
        <span>{uploading ? 'Enviando...' : label}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  );
};
