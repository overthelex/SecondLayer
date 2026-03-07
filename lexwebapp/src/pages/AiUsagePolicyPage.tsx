import { Bot } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/ai-usage-uk.md?raw';
import contentEn from '../content/legal/ai-usage-en.md?raw';

export function AiUsagePolicyPage() {
  return (
    <LegalPageLayout
      icon={<Bot size={28} className="text-violet-600" />}
      iconBgClass="bg-violet-100"
      routePath="ai-usage"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
