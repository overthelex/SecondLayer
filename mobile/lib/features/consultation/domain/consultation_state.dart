import '../data/models/consultation.dart';
import '../data/models/consultation_message.dart';

class ConsultationState {
  final List<Consultation> consultations;
  final bool isLoadingConsultations;
  final String? error;

  const ConsultationState({
    this.consultations = const [],
    this.isLoadingConsultations = false,
    this.error,
  });

  ConsultationState copyWith({
    List<Consultation>? consultations,
    bool? isLoadingConsultations,
    String? error,
    bool clearError = false,
  }) =>
      ConsultationState(
        consultations: consultations ?? this.consultations,
        isLoadingConsultations:
            isLoadingConsultations ?? this.isLoadingConsultations,
        error: clearError ? null : (error ?? this.error),
      );
}

class ConsultationChatState {
  final String consultationId;
  final List<ConsultationMessage> messages;
  final bool isLoading;
  final bool isTyping;
  final String? error;

  const ConsultationChatState({
    required this.consultationId,
    this.messages = const [],
    this.isLoading = false,
    this.isTyping = false,
    this.error,
  });

  ConsultationChatState copyWith({
    List<ConsultationMessage>? messages,
    bool? isLoading,
    bool? isTyping,
    String? error,
    bool clearError = false,
  }) =>
      ConsultationChatState(
        consultationId: consultationId,
        messages: messages ?? this.messages,
        isLoading: isLoading ?? this.isLoading,
        isTyping: isTyping ?? this.isTyping,
        error: clearError ? null : (error ?? this.error),
      );
}
