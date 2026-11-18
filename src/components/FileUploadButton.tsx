import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result);
        const base = serverUrl || '';
        const res = await fetch(`${base}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, dataUrl }),
        });
        if (res.ok) {
          const data = (await res.json()) as { url: string; filename: string };
          onUploaded(data.url, data.filename);
        } else {
          // Fallback to dataUrl if offline
          onUploaded(dataUrl, file.name);
        }
      } catch {
        onUploaded(String(reader.result), file.name);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
