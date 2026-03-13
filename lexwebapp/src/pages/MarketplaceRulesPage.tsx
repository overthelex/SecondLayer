import { BookOpen } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/marketplace-rules-uk.md?raw';
import contentEn from '../content/legal/marketplace-rules-en.md?raw';

export function MarketplaceRulesPage() {
  return (
    <LegalPageLayout
      icon={<BookOpen size={28} className="text-emerald-600" />}
      iconBgClass="bg-emerald-100"
      routePath="marketplace-rules"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
