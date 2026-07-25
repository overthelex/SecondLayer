import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { ERAULawyer } from '../../../services/api/ERAUService';
import type { AttorneyProfile } from '../../../services/api/AttorneyService';
import { StepIndicator } from './StepIndicator';
import { Step1Welcome } from './Step1Welcome';
import { Step2ERAUSearch } from './Step2ERAUSearch';
import { Step3Confirm } from './Step3Confirm';

interface AttorneyOnboardingModalProps {
  open: boolean;
  onComplete: (data: Partial<AttorneyProfile>) => void;
  onSkip: () => void;
}

export function AttorneyOnboardingModal({ open, onComplete, onSkip }: AttorneyOnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [selectedLawyer, setSelectedLawyer] = useState<ERAULawyer | null>(null);

  const handleSkip = () => {
    sessionStorage.setItem('attorney_onboarding_skipped', '1');
    onSkip();
  };

  const handleSelectLawyer = (lawyer: ERAULawyer) => {
    setSelectedLawyer(lawyer);
    setStep(3);
  };

  const handleSkipERAU = () => {
    setSelectedLawyer(null);
    setStep(3);
  };

  const handleSubmit = (data: Partial<AttorneyProfile>) => {
    onComplete(data);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 pt-5">
              <StepIndicator currentStep={step} totalSteps={3} />
              <button
                onClick={handleSkip}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {step === 1 && (
              <Step1Welcome
                onContinue={() => setStep(2)}
                onSkip={handleSkip}
              />
            )}
            {step === 2 && (
              <Step2ERAUSearch
                onSelect={handleSelectLawyer}
                onSkip={handleSkipERAU}
              />
            )}
            {step === 3 && (
              <Step3Confirm
                lawyer={selectedLawyer}
                onSubmit={handleSubmit}
                onBack={() => setStep(2)}
              />
            )}

            <div className="pb-5" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
