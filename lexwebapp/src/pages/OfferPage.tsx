import { FileText } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/offer-uk.md?raw';
import contentEn from '../content/legal/offer-en.md?raw';

export function OfferPage() {
  return (
    <LegalPageLayout
      icon={<FileText size={28} className="text-blue-600" />}
      iconBgClass="bg-blue-100"
      routePath="offer"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
