import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../storage/secure_storage.dart';
import '../../config/app_config.dart';

class SSEEvent {
  final String? id;
  final String event;
  final dynamic data;

  const SSEEvent({this.id, required this.event, required this.data});
}

class SSEClient {
  final AppConfig config;
  final SecureStorage storage;

  SSEClient({required this.config, required this.storage});

  /// Opens a POST SSE stream (used for /api/chat).
  /// Returns a StreamSubscription that can be cancelled.
  Future<StreamSubscription?> stream({
    required String path,
    required Map<String, dynamic> body,
    required void Function(SSEEvent event) onEvent,
    required void Function() onDone,
    required void Function(dynamic error) onError,
  }) async {
    final request = http.Request(
      'POST',
      Uri.parse('${config.apiUrl}$path'),
    )
      ..headers.addAll(await _headers())
      ..body = jsonEncode(body);

    return _sendRequest(
      request: request,
      onEvent: onEvent,
      onDone: onDone,
      onError: onError,
    );
  }

  /// Opens a GET SSE stream (used for consultation messages).
  Future<StreamSubscription?> streamGet({
    required String path,
    required void Function(SSEEvent event) onEvent,
    required void Function() onDone,
    required void Function(dynamic error) onError,
  }) async {
    final request = http.Request(
      'GET',
      Uri.parse('${config.apiUrl}$path'),
    )..headers.addAll(await _headers());

    return _sendRequest(
      request: request,
      onEvent: onEvent,
      onDone: onDone,
      onError: onError,
    );
  }

  Future<Map<String, String>> _headers() async {
    final token = await storage.getToken();
    return {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<StreamSubscription?> _sendRequest({
    required http.Request request,
    required void Function(SSEEvent event) onEvent,
    required void Function() onDone,
    required void Function(dynamic error) onError,
  }) async {
    try {
      final client = http.Client();
      final response = await client.send(request);

      if (response.statusCode != 200) {
        final responseBody = await response.stream.bytesToString();
        onError(Exception(
            'SSE error ${response.statusCode}: $responseBody'));
        client.close();
        return null;
      }

      final subscription = response.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .transform(_SSETransformer())
          .listen(
        onEvent,
        onDone: () {
          onDone();
          client.close();
        },
        onError: (error) {
          onError(error);
          client.close();
        },
        cancelOnError: false,
      );

      return subscription;
    } catch (e) {
      onError(e);
      return null;
    }
  }
}

/// Transforms a stream of SSE lines into SSEEvent objects.
/// SSE format: "event: type\ndata: json\n\n"
class _SSETransformer extends StreamTransformerBase<String, SSEEvent> {
  @override
  Stream<SSEEvent> bind(Stream<String> stream) {
    return Stream.eventTransformed(stream, (sink) => _SSESink(sink));
  }
}

class _SSESink implements EventSink<String> {
  final EventSink<SSEEvent> _output;
  String? _event;
  String? _id;
  final _dataBuffer = StringBuffer();

  _SSESink(this._output);

  @override
  void add(String line) {
    if (line.isEmpty) {
      // Empty line = end of event
      _flush();
      return;
    }

    if (line.startsWith('event:')) {
      _event = line.substring(6).trim();
    } else if (line.startsWith('data:')) {
      if (_dataBuffer.isNotEmpty) _dataBuffer.write('\n');
      _dataBuffer.write(line.substring(5).trim());
    } else if (line.startsWith('id:')) {
      _id = line.substring(3).trim();
    }
    // Ignore "retry:" and comments (lines starting with ':')
  }

  void _flush() {
    if (_dataBuffer.isEmpty && _event == null) return;

    final rawData = _dataBuffer.toString();
    dynamic parsed;
    try {
      parsed = jsonDecode(rawData);
    } catch (_) {
      parsed = rawData;
    }

    _output.add(SSEEvent(
      id: _id,
      event: _event ?? 'message',
      data: parsed,
    ));

    _event = null;
    _id = null;
    _dataBuffer.clear();
  }

  @override
  void addError(Object error, [StackTrace? stackTrace]) {
    _output.addError(error, stackTrace);
  }

  @override
  void close() {
    _flush();
    _output.close();
  }
}
