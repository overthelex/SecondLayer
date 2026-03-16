import 'models/message.dart';

/// Pure function that extracts evidence from tool results based on tool name.
class EvidenceExtractResult {
  final List<Decision> decisions;
  final List<Citation> citations;
  final List<VaultDocument> documents;

  const EvidenceExtractResult({
    this.decisions = const [],
    this.citations = const [],
    this.documents = const [],
  });

  bool get isEmpty => decisions.isEmpty && citations.isEmpty && documents.isEmpty;
}

EvidenceExtractResult extractEvidence(String toolName, dynamic result) {
  if (result == null) return const EvidenceExtractResult();

  try {
    switch (toolName) {
      case 'search_legal_precedents':
      case 'search_court_decisions':
      case 'search_practice':
      case 'semantic_search':
        return _extractDecisions(result);

      case 'search_legislation':
      case 'get_legislation_text':
      case 'get_article':
        return _extractCitations(result);

      case 'vault_search':
      case 'vault_list':
        return _extractDocuments(result);

      default:
        // Try to extract decisions from any result with a 'decisions' or 'results' key
        if (result is Map<String, dynamic>) {
          if (result.containsKey('decisions') || result.containsKey('results')) {
            return _extractDecisions(result);
          }
          if (result.containsKey('citations') || result.containsKey('articles')) {
            return _extractCitations(result);
          }
          if (result.containsKey('documents')) {
            return _extractDocuments(result);
          }
        }
        return const EvidenceExtractResult();
    }
  } catch (_) {
    return const EvidenceExtractResult();
  }
}

EvidenceExtractResult _extractDecisions(dynamic result) {
  final decisions = <Decision>[];

  List<dynamic>? items;
  if (result is Map<String, dynamic>) {
    items = result['decisions'] as List? ??
        result['results'] as List? ??
        result['items'] as List?;
  } else if (result is List) {
    items = result;
  }

  if (items != null) {
    for (final item in items) {
      if (item is Map<String, dynamic>) {
        decisions.add(Decision.fromJson(item));
      }
    }
  }

  return EvidenceExtractResult(decisions: decisions);
}

EvidenceExtractResult _extractCitations(dynamic result) {
  final citations = <Citation>[];

  List<dynamic>? items;
  if (result is Map<String, dynamic>) {
    items = result['citations'] as List? ??
        result['articles'] as List? ??
        result['sections'] as List?;

    // Single legislation text result
    if (items == null && result.containsKey('text')) {
      citations.add(Citation(
        text: (result['text'] as String?)?.substring(
                0,
                ((result['text'] as String?)?.length ?? 0) > 200
                    ? 200
                    : (result['text'] as String?)?.length ?? 0) ??
            '',
        source: result['title'] as String? ??
            result['source'] as String? ??
            '',
      ));
      return EvidenceExtractResult(citations: citations);
    }
  } else if (result is List) {
    items = result;
  }

  if (items != null) {
    for (final item in items) {
      if (item is Map<String, dynamic>) {
        citations.add(Citation(
          text: item['text'] as String? ?? item['content'] as String? ?? '',
          source: item['source'] as String? ??
              item['title'] as String? ??
              item['article'] as String? ??
              '',
        ));
      }
    }
  }

  return EvidenceExtractResult(citations: citations);
}

EvidenceExtractResult _extractDocuments(dynamic result) {
  final documents = <VaultDocument>[];

  List<dynamic>? items;
  if (result is Map<String, dynamic>) {
    items = result['documents'] as List? ??
        result['results'] as List? ??
        result['items'] as List?;
  } else if (result is List) {
    items = result;
  }

  if (items != null) {
    for (final item in items) {
      if (item is Map<String, dynamic>) {
        documents.add(VaultDocument.fromJson(item));
      }
    }
  }

  return EvidenceExtractResult(documents: documents);
}
