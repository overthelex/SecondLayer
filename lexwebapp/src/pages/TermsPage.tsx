import { FileText } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/terms-uk.md?raw';
import contentEn from '../content/legal/terms-en.md?raw';

export function TermsPage() {
  return (
    <LegalPageLayout
      icon={<FileText size={28} className="text-blue-600" />}
      iconBgClass="bg-blue-100"
      routePath="terms"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
