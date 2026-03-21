import '../data/models/consultation.dart';
import '../data/models/consultation_message.dart';

class ConsultationState {
  final List<Consultation> consultations;
  final bool isLoadingConsultations;
  final List<AttorneyPayout> payouts;
  final bool isLoadingPayouts;
  final String? error;

  const ConsultationState({
    this.consultations = const [],
    this.isLoadingConsultations = false,
    this.payouts = const [],
    this.isLoadingPayouts = false,
    this.error,
  });

  ConsultationState copyWith({
    List<Consultation>? consultations,
    bool? isLoadingConsultations,
    List<AttorneyPayout>? payouts,
    bool? isLoadingPayouts,
    String? error,
    bool clearError = false,
  }) =>
      ConsultationState(
        consultations: consultations ?? this.consultations,
        isLoadingConsultations:
            isLoadingConsultations ?? this.isLoadingConsultations,
        payouts: payouts ?? this.payouts,
        isLoadingPayouts: isLoadingPayouts ?? this.isLoadingPayouts,
        error: clearError ? null : (error ?? this.error),
      );
}

class ConsultationChatState {
  final String consultationId;
  final List<ConsultationMessage> messages;
  final bool isLoading;
  final String? typingUserName;
  final Set<String> savedAttachmentMessageIds;
  final String? error;

  const ConsultationChatState({
    required this.consultationId,
    this.messages = const [],
    this.isLoading = false,
    this.typingUserName,
    this.savedAttachmentMessageIds = const {},
    this.error,
  });

  ConsultationChatState copyWith({
    List<ConsultationMessage>? messages,
    bool? isLoading,
    String? typingUserName,
    bool clearTyping = false,
    Set<String>? savedAttachmentMessageIds,
    String? error,
    bool clearError = false,
  }) =>
      ConsultationChatState(
        consultationId: consultationId,
        messages: messages ?? this.messages,
        isLoading: isLoading ?? this.isLoading,
        typingUserName:
            clearTyping ? null : (typingUserName ?? this.typingUserName),
        savedAttachmentMessageIds:
            savedAttachmentMessageIds ?? this.savedAttachmentMessageIds,
        error: clearError ? null : (error ?? this.error),
      );
}
