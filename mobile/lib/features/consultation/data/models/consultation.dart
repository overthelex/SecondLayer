class Consultation {
  final String id;
  final String title;
  final String? clientName;
  final String status; // 'active' | 'closed' | 'pending'
  final DateTime createdAt;
  final DateTime updatedAt;
  final int unreadCount;

  const Consultation({
    required this.id,
    required this.title,
    this.clientName,
    this.status = 'active',
    required this.createdAt,
    required this.updatedAt,
    this.unreadCount = 0,
  });

  factory Consultation.fromJson(Map<String, dynamic> json) => Consultation(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        clientName: json['client_name'] as String?,
        status: json['status'] as String? ?? 'active',
        createdAt: DateTime.parse(
            json['created_at'] as String? ?? DateTime.now().toIso8601String()),
        updatedAt: DateTime.parse(
            json['updated_at'] as String? ?? DateTime.now().toIso8601String()),
        unreadCount: json['unread_count'] as int? ?? 0,
      );
}
