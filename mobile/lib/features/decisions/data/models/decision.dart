class CourtDecision {
  final String id;
  final String docId;
  final String number;
  final String court;
  final String date;
  final String type;
  final String summary;
  final double relevance;
  final String? fullText;
  final String? judge;
  final String? instance;

  const CourtDecision({
    required this.id,
    required this.docId,
    required this.number,
    required this.court,
    required this.date,
    this.type = '',
    required this.summary,
    this.relevance = 0,
    this.fullText,
    this.judge,
    this.instance,
  });

  factory CourtDecision.fromJson(Map<String, dynamic> json) => CourtDecision(
        id: json['id']?.toString() ?? '',
        docId: json['doc_id']?.toString() ?? json['docId']?.toString() ?? '',
        number: json['number'] as String? ?? json['case_number'] as String? ?? '',
        court: json['court'] as String? ?? json['court_name'] as String? ?? '',
        date: json['date'] as String? ?? json['decision_date'] as String? ?? '',
        type: json['type'] as String? ?? json['document_type'] as String? ?? '',
        summary: json['summary'] as String? ?? json['snippet'] as String? ?? '',
        relevance: (json['relevance'] as num?)?.toDouble() ??
            (json['score'] as num?)?.toDouble() ??
            0,
        fullText: json['full_text'] as String? ?? json['fullText'] as String?,
        judge: json['judge'] as String?,
        instance: json['instance'] as String?,
      );
}

class DecisionSearchFilters {
  final String? procedureCode; // ГПК, ЦПК, КАС, КПК
  final String? courtLevel; // supreme, appeal, first
  final String? dateFrom;
  final String? dateTo;

  const DecisionSearchFilters({
    this.procedureCode,
    this.courtLevel,
    this.dateFrom,
    this.dateTo,
  });

  Map<String, dynamic> toParams() => {
        if (procedureCode != null) 'procedure_code': procedureCode,
        if (courtLevel != null) 'court_level': courtLevel,
        if (dateFrom != null) 'date_from': dateFrom,
        if (dateTo != null) 'date_to': dateTo,
      };

  DecisionSearchFilters copyWith({
    String? procedureCode,
    String? courtLevel,
    String? dateFrom,
    String? dateTo,
    bool clearProcedure = false,
    bool clearLevel = false,
    bool clearDateFrom = false,
    bool clearDateTo = false,
  }) =>
      DecisionSearchFilters(
        procedureCode:
            clearProcedure ? null : (procedureCode ?? this.procedureCode),
        courtLevel: clearLevel ? null : (courtLevel ?? this.courtLevel),
        dateFrom: clearDateFrom ? null : (dateFrom ?? this.dateFrom),
        dateTo: clearDateTo ? null : (dateTo ?? this.dateTo),
      );
}
