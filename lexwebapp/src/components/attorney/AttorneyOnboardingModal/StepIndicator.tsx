interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                isActive
                  ? 'bg-claude-accent scale-125'
                  : isCompleted
                    ? 'bg-claude-accent/50'
                    : 'bg-gray-200'
              }`}
            />
            {step < totalSteps && (
              <div
                className={`w-8 h-0.5 transition-colors duration-300 ${
                  isCompleted ? 'bg-claude-accent/50' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
