import '../../config/app_config.dart';
import '../network/api_client.dart';
import '../network/sse_client.dart';
import '../storage/secure_storage.dart';
import '../storage/local_cache.dart';

class ServiceLocator {
  static final ServiceLocator _instance = ServiceLocator._();
  factory ServiceLocator() => _instance;
  ServiceLocator._();

  late final AppConfig config;
  late final SecureStorage secureStorage;
  late final LocalCache localCache;
  late final ApiClient apiClient;
  late final SSEClient sseClient;

  Future<void> init(AppConfig appConfig) async {
    config = appConfig;
    secureStorage = SecureStorage();
    localCache = LocalCache();
    await localCache.init();

    apiClient = ApiClient(config: config, storage: secureStorage);
    sseClient = SSEClient(config: config, storage: secureStorage);
  }
}

// Global accessor
final sl = ServiceLocator();
