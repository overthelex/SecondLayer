import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/config/app_config.dart';

void main() {
  test('AppConfig properties work correctly', () {
    const local = AppConfig(apiUrl: 'http://10.0.2.2:3000', flavor: 'local');
    expect(local.apiUrl, 'http://10.0.2.2:3000');
    expect(local.isLocal, true);
    expect(local.isStage, false);
    expect(local.isProd, false);

    const stage = AppConfig(apiUrl: 'https://stage.legal.org.ua', flavor: 'stage');
    expect(stage.isStage, true);
    expect(stage.isProd, false);

    const prod = AppConfig(apiUrl: 'https://legal.org.ua', flavor: 'prod');
    expect(prod.isProd, true);
    expect(prod.isLocal, false);
  });
}
