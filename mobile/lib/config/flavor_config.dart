import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'app_config.dart';

Future<AppConfig> loadConfig(String envFile) async {
  await dotenv.load(fileName: envFile);
  return AppConfig(
    apiUrl: dotenv.env['API_URL'] ?? 'https://stage.legal.org.ua',
    flavor: dotenv.env['FLAVOR'] ?? 'stage',
  );
}
