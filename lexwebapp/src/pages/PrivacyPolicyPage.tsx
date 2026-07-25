import { Shield } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/privacy-uk.md?raw';
import contentEn from '../content/legal/privacy-en.md?raw';

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      icon={<Shield size={28} className="text-green-600" />}
      iconBgClass="bg-green-100"
      routePath="privacy"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
