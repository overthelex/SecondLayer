import { Eye } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/ai-transparency-uk.md?raw';
import contentEn from '../content/legal/ai-transparency-en.md?raw';

export function AiTransparencyPage() {
  return (
    <LegalPageLayout
      icon={<Eye size={28} className="text-teal-600" />}
      iconBgClass="bg-teal-100"
      routePath="ai-transparency"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
