class Consultation {
  final String id;
  final String title;
  final String? clientName;
  final String? attorneyName;
  final String? clientUserId;
  final String? attorneyUserId;
  final String status;
  final String? requestDescription;
  final double? agreedFeeUah;
  final List<String> documentIds;
  final String? declineReason;
  final String? cancelReason;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int unreadCount;

  const Consultation({
    required this.id,
    required this.title,
    this.clientName,
    this.attorneyName,
    this.clientUserId,
    this.attorneyUserId,
    this.status = 'pending',
    this.requestDescription,
    this.agreedFeeUah,
    this.documentIds = const [],
    this.declineReason,
    this.cancelReason,
    required this.createdAt,
    required this.updatedAt,
    this.unreadCount = 0,
  });

  factory Consultation.fromJson(Map<String, dynamic> json) => Consultation(
        id: json['id'] as String? ?? '',
        title: json['request_title'] as String? ?? json['title'] as String? ?? '',
        clientName: json['client_name'] as String?,
        attorneyName: json['attorney_name'] as String?,
        clientUserId: json['client_user_id'] as String?,
        attorneyUserId: json['attorney_user_id'] as String?,
        status: json['status'] as String? ?? 'pending',
        requestDescription: json['request_description'] as String?,
        agreedFeeUah: (json['agreed_fee_uah'] as num?)?.toDouble(),
        documentIds: (json['document_ids'] as List?)?.map((e) => e.toString()).toList() ?? [],
        declineReason: json['decline_reason'] as String?,
        cancelReason: json['cancel_reason'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String? ?? DateTime.now().toIso8601String()),
        updatedAt: DateTime.parse(json['updated_at'] as String? ?? DateTime.now().toIso8601String()),
        unreadCount: json['unread_count'] as int? ?? 0,
      );
}

class ConsultationPayment {
  final String id;
  final String consultationId;
  final double amountUah;
  final double platformFeeUah;
  final double attorneyPayoutUah;
  final String status;
  final String? paymentProvider;
  final DateTime createdAt;

  const ConsultationPayment({
    required this.id,
    required this.consultationId,
    required this.amountUah,
    required this.platformFeeUah,
    required this.attorneyPayoutUah,
    required this.status,
    this.paymentProvider,
    required this.createdAt,
  });

  factory ConsultationPayment.fromJson(Map<String, dynamic> json) => ConsultationPayment(
        id: json['id'] as String? ?? '',
        consultationId: json['consultation_id'] as String? ?? '',
        amountUah: (json['amount_uah'] as num?)?.toDouble() ?? 0,
        platformFeeUah: (json['platform_fee_uah'] as num?)?.toDouble() ?? 0,
        attorneyPayoutUah: (json['attorney_payout_uah'] as num?)?.toDouble() ?? 0,
        status: json['status'] as String? ?? 'pending',
        paymentProvider: json['payment_provider'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String? ?? DateTime.now().toIso8601String()),
      );
}

class AttorneyPayout {
  final String id;
  final String attorneyUserId;
  final String? consultationPaymentId;
  final double amountUah;
  final String status;
  final DateTime createdAt;
  final String? consultationId;
  final String? requestTitle;

  const AttorneyPayout({
    required this.id,
    required this.attorneyUserId,
    this.consultationPaymentId,
    required this.amountUah,
    required this.status,
    required this.createdAt,
    this.consultationId,
    this.requestTitle,
  });

  factory AttorneyPayout.fromJson(Map<String, dynamic> json) => AttorneyPayout(
        id: json['id'] as String? ?? '',
        attorneyUserId: json['attorney_user_id'] as String? ?? '',
        consultationPaymentId: json['consultation_payment_id'] as String?,
        amountUah: (json['amount_uah'] as num?)?.toDouble() ?? 0,
        status: json['status'] as String? ?? 'pending',
        createdAt: DateTime.parse(json['created_at'] as String? ?? DateTime.now().toIso8601String()),
        consultationId: json['consultation_id'] as String?,
        requestTitle: json['request_title'] as String?,
      );
}
