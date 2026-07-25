import 'package:dio/dio.dart';
import '../../config/app_config.dart';
import '../errors/app_exception.dart';
import '../storage/secure_storage.dart';
import 'auth_interceptor.dart';

class ApiClient {
  late final Dio dio;
  final AppConfig config;
  final SecureStorage storage;

  ApiClient({required this.config, required this.storage}) {
    dio = Dio(BaseOptions(
      baseUrl: config.apiUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    dio.interceptors.addAll([
      AuthInterceptor(storage, dio),
      if (!config.isProd) LogInterceptor(requestBody: true, responseBody: true),
    ]);
  }

  Future<Response<T>> get<T>(String path,
      {Map<String, dynamic>? queryParameters}) async {
    try {
      return await dio.get<T>(path, queryParameters: queryParameters);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Response<T>> post<T>(String path, {dynamic data}) async {
    try {
      return await dio.post<T>(path, data: data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Response<T>> put<T>(String path, {dynamic data}) async {
    try {
      return await dio.put<T>(path, data: data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Response<T>> delete<T>(String path) async {
    try {
      return await dio.delete<T>(path);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  AppException _handleError(DioException e) {
    switch (e.response?.statusCode) {
      case 401:
        return const UnauthorizedException();
      case 402:
        return const InsufficientBalanceException();
      case 429:
        final retryAfter = e.response?.headers.value('retry-after');
        return RateLimitException(
          retryAfter: retryAfter != null
              ? Duration(seconds: int.tryParse(retryAfter) ?? 5)
              : null,
        );
      default:
        if (e.type == DioExceptionType.connectionError ||
            e.type == DioExceptionType.connectionTimeout) {
          return const NetworkException();
        }
        final responseData = e.response?.data;
        final message = (responseData is Map<String, dynamic>
                ? responseData['message']
                : responseData?.toString()) ??
            e.message ??
            'Невідома помилка';
        return AppException(message,
            statusCode: e.response?.statusCode, originalError: e);
    }
  }
}
