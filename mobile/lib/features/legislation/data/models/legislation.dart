class LegislationCode {
  final String id;
  final String title;
  final String shortTitle;
  final String? description;
  final int? articleCount;

  const LegislationCode({
    required this.id,
    required this.title,
    required this.shortTitle,
    this.description,
    this.articleCount,
  });

  factory LegislationCode.fromJson(Map<String, dynamic> json) =>
      LegislationCode(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? json['name'] as String? ?? '',
        shortTitle:
            json['short_title'] as String? ?? json['alias'] as String? ?? '',
        description: json['description'] as String?,
        articleCount: json['article_count'] as int?,
      );
}

class LegislationSection {
  final String id;
  final String title;
  final String type; // 'chapter', 'section', 'article', etc.
  final int? number;
  final List<LegislationSection> children;

  const LegislationSection({
    required this.id,
    required this.title,
    required this.type,
    this.number,
    this.children = const [],
  });

  factory LegislationSection.fromJson(Map<String, dynamic> json) =>
      LegislationSection(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? '',
        type: json['type'] as String? ?? 'section',
        number: json['number'] as int?,
        children: (json['children'] as List?)
                ?.map((e) =>
                    LegislationSection.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
      );
}

class LegislationArticle {
  final String id;
  final int number;
  final String title;
  final String content;
  final String? legislationId;

  const LegislationArticle({
    required this.id,
    required this.number,
    required this.title,
    required this.content,
    this.legislationId,
  });

  factory LegislationArticle.fromJson(Map<String, dynamic> json) =>
      LegislationArticle(
        id: json['id']?.toString() ?? '',
        number: json['number'] as int? ??
            int.tryParse(json['article_number']?.toString() ?? '') ??
            0,
        title: json['title'] as String? ?? '',
        content: json['content'] as String? ?? json['text'] as String? ?? '',
        legislationId: json['legislation_id']?.toString(),
      );
}
