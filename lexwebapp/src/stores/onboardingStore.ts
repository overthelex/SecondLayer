import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  isActive: boolean;
  currentStep: number;
  isCompleted: boolean;
  startTour: () => void;
  nextStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      isActive: false,
      currentStep: 0,
      isCompleted: false,
      startTour: () => set({ isActive: true, currentStep: 0 }),
      nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
      skipTour: () => set({ isActive: false, currentStep: 0, isCompleted: true }),
      completeTour: () => set({ isActive: false, currentStep: 0, isCompleted: true }),
    }),
    {
      name: 'onboarding-storage',
      partialize: (state) => ({ isCompleted: state.isCompleted }),
    }
  )
);
