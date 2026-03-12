import { Scale } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/attorney-offer-uk.md?raw';
import contentEn from '../content/legal/attorney-offer-en.md?raw';

export function AttorneyOfferPage() {
  return (
    <LegalPageLayout
      icon={<Scale size={28} className="text-indigo-600" />}
      iconBgClass="bg-indigo-100"
      routePath="attorney-offer"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
