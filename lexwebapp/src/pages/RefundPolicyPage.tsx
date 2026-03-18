import { RotateCcw } from 'lucide-react';
import { LegalPageLayout } from '../components/LegalPageLayout';
import contentUk from '../content/legal/refund-policy-uk.md?raw';
import contentEn from '../content/legal/refund-policy-en.md?raw';

export function RefundPolicyPage() {
  return (
    <LegalPageLayout
      icon={<RotateCcw size={28} className="text-orange-600" />}
      iconBgClass="bg-orange-100"
      routePath="refund-policy"
      contentUk={contentUk}
      contentEn={contentEn}
    />
  );
}
