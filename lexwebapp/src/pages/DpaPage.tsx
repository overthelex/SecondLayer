import { ShieldCheck } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/dpa-uk.md?raw';
import contentEn from '../content/legal/dpa-en.md?raw';

export function DpaPage() {
  return (
    <LegalPageLayout
      icon={<ShieldCheck size={28} className="text-indigo-600" />}
      iconBgClass="bg-indigo-100"
      routePath="dpa"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
