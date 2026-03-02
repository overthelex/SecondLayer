import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'config/flavor_config.dart';
import 'core/di/service_locator.dart';
import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = await loadConfig('.env.prod');
  await sl.init(config);

  runApp(const ProviderScope(child: SecondLayerApp()));
}
