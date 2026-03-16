class ConsultationMessage {
  final String id;
  final String consultationId;
  final String senderId;
  final String senderName;
  final String content;
  final String status; // 'sending' | 'sent' | 'delivered' | 'read'
  final DateTime createdAt;
  final List<ConsultationAttachment> attachments;

  const ConsultationMessage({
    required this.id,
    required this.consultationId,
    required this.senderId,
    required this.senderName,
    required this.content,
    this.status = 'sent',
    required this.createdAt,
    this.attachments = const [],
  });

  ConsultationMessage copyWith({String? status}) => ConsultationMessage(
        id: id,
        consultationId: consultationId,
        senderId: senderId,
        senderName: senderName,
        content: content,
        status: status ?? this.status,
        createdAt: createdAt,
        attachments: attachments,
      );

  factory ConsultationMessage.fromJson(Map<String, dynamic> json) =>
      ConsultationMessage(
        id: json['id'] as String? ?? '',
        consultationId: json['consultation_id'] as String? ?? '',
        senderId: json['sender_id'] as String? ?? '',
        senderName: json['sender_name'] as String? ?? '',
        content: json['content'] as String? ?? '',
        status: json['status'] as String? ?? 'sent',
        createdAt: DateTime.parse(
            json['created_at'] as String? ?? DateTime.now().toIso8601String()),
        attachments: (json['attachments'] as List?)
                ?.map((e) =>
                    ConsultationAttachment.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
      );
}

class ConsultationAttachment {
  final String id;
  final String name;
  final String type; // 'file' | 'image'
  final String url;
  final int? size;

  const ConsultationAttachment({
    required this.id,
    required this.name,
    required this.type,
    required this.url,
    this.size,
  });

  factory ConsultationAttachment.fromJson(Map<String, dynamic> json) =>
      ConsultationAttachment(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        type: json['type'] as String? ?? 'file',
        url: json['url'] as String? ?? '',
        size: json['size'] as int?,
      );
}
