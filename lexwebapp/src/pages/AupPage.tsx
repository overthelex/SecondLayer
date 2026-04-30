import { ShieldAlert } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/aup-uk.md?raw';

export function AupPage() {
  return (
    <LegalPageLayout
      icon={<ShieldAlert size={28} className="text-red-600" />}
      iconBgClass="bg-red-100"
      routePath="aup"
      contentUk={contentUk}
      contentEn={contentUk}
    />
  );
}
