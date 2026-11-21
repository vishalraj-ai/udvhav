import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { auth } from '../firebase';

interface Props {
  storageUrl: string;
  alt: string;
  className?: string;
}

export function SecureEvidenceImage({ storageUrl, alt, className = 'w-full h-44 object-cover rounded-md' }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function load() {
      try {
        setFailed(false);
        const user = auth.currentUser;
        if (!user) {
          setFailed(true);
          return;
        }
        const token = await user.getIdToken();
        const resp = await fetch(storageUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error('Failed to load protected image');
        const blob = await resp.blob();
        createdUrl = URL.createObjectURL(blob);
        if (active) setBlobUrl(createdUrl);
      } catch {
        if (active) setFailed(true);
      }
    }

    if (storageUrl) {
      void load();
    } else {
      setFailed(true);
    }

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [storageUrl]);

  if (failed) {
    return (
      <div className={`${className} bg-slate-100 border border-slate-200 flex flex-col items-center justify-center gap-1.5 text-slate-500 p-4`}>
        <ImageOff className="w-5 h-5" />
        <span className="text-xs text-center">{alt || 'Evidence preview unavailable'}</span>
      </div>
    );
  }

  if (!blobUrl) {
    return <div className={`${className} bg-slate-100 animate-pulse`} />;
  }

  return <img src={blobUrl} alt={alt} referrerPolicy="no-referrer" className={className} />;
}
