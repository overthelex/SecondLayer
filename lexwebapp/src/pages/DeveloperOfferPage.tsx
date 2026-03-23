import { Code } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/developer-offer-uk.md?raw';
import contentEn from '../content/legal/developer-offer-en.md?raw';

export function DeveloperOfferPage() {
  return (
    <LegalPageLayout
      icon={<Code size={28} className="text-violet-600" />}
      iconBgClass="bg-violet-100"
      routePath="developer-offer"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
