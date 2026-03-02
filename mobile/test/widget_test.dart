import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/config/app_config.dart';
import 'package:secondlayer_mobile/core/di/service_locator.dart';

void main() {
  test('ServiceLocator initializes with config', () async {
    const config = AppConfig(apiUrl: 'http://localhost:3000', flavor: 'local');
    await sl.init(config);

    expect(sl.config.apiUrl, 'http://localhost:3000');
    expect(sl.config.isLocal, true);
    expect(sl.config.isProd, false);
    expect(sl.apiClient, isNotNull);
    expect(sl.sseClient, isNotNull);
    expect(sl.secureStorage, isNotNull);
  });
}
