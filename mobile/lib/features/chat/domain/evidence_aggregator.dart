import '../data/models/message.dart';
import 'chat_state.dart';

/// Scans all messages and deduplicates evidence into an EvidenceState.
EvidenceState aggregateEvidence(List<Message> messages) {
  final decisionsMap = <String, Decision>{};
  final otherDocsMap = <String, Decision>{};
  final citationsMap = <String, Citation>{};
  final documentsMap = <String, VaultDocument>{};

  // Decision document types that count as "main" decisions
  const mainDecisionTypes = {
    'Рішення',
    'Вирок',
    'Постанова',
    null, // unknown type defaults to main
    '',
  };

  for (final message in messages) {
    // Decisions
    for (final d in message.decisions) {
      final key = d.id.isNotEmpty ? d.id : '${d.court}_${d.number}';
      if (mainDecisionTypes.contains(d.documentType)) {
        decisionsMap[key] = d;
      } else {
        otherDocsMap[key] = d;
      }
    }

    // Citations — dedupe by normalized source
    for (final c in message.citations) {
      final key = c.source.trim().toLowerCase();
      if (key.isNotEmpty) {
        citationsMap[key] = c;
      }
    }

    // Documents — dedupe by id
    for (final doc in message.documents) {
      if (doc.id.isNotEmpty) {
        documentsMap[doc.id] = doc;
      }
    }
  }

  return EvidenceState(
    decisions: decisionsMap.values.toList(),
    otherCourtDocs: otherDocsMap.values.toList(),
    citations: citationsMap.values.toList(),
    vaultDocuments: documentsMap.values.toList(),
  );
}
