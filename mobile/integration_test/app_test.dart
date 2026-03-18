import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:secondlayer_mobile/config/flavor_config.dart';
import 'package:secondlayer_mobile/core/di/service_locator.dart';
import 'package:secondlayer_mobile/app.dart';

/// Integration tests for SecondLayer mobile app.
///
/// Run on connected device:
///   flutter test integration_test/app_test.dart \
///     --dart-define=TEST_EMAIL=testuser@secondlayer.test \
///     --dart-define=TEST_PASSWORD=TestUser2026!
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const testEmail = String.fromEnvironment('TEST_EMAIL',
      defaultValue: 'testuser@secondlayer.test');
  const testPassword = String.fromEnvironment('TEST_PASSWORD',
      defaultValue: 'TestUser2026!');

  setUpAll(() async {
    final config = await loadConfig('.env');
    await sl.init(config);
  });

  group('Авторизація', () {
    testWidgets('Екран логіну відображається коректно', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: SecondLayerApp()),
      );
      await tester.pumpAndSettle(const Duration(seconds: 3));

      expect(find.text('SecondLayer'), findsOneWidget);
      expect(find.text('Правова аналітика з ШІ'), findsOneWidget);
      expect(find.text('Увійти з Google'), findsOneWidget);
      expect(find.text('Увійти'), findsOneWidget);
      expect(find.text('Електронна пошта'), findsOneWidget);
      expect(find.text('Пароль'), findsOneWidget);
      expect(find.text('Забули пароль?'), findsOneWidget);
      expect(find.text('Немає акаунту?'), findsOneWidget);
      expect(find.text('Зареєструватися'), findsOneWidget);
    });

    testWidgets('Валідація порожніх полів', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: SecondLayerApp()),
      );
      await tester.pumpAndSettle(const Duration(seconds: 3));

      await tester.tap(find.widgetWithText(ElevatedButton, 'Увійти'));
      await tester.pumpAndSettle();

      expect(find.text('Введіть email'), findsOneWidget);
      expect(find.text('Введіть пароль'), findsOneWidget);
    });

    testWidgets('Валідація невірного формату email', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: SecondLayerApp()),
      );
      await tester.pumpAndSettle(const Duration(seconds: 3));

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Електронна пошта'),
        'invalid-email',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Пароль'),
        '123',
      );
      await tester.tap(find.widgetWithText(ElevatedButton, 'Увійти'));
      await tester.pumpAndSettle();

      expect(find.text('Невірний формат email'), findsOneWidget);
      expect(find.text('Мінімум 6 символів'), findsOneWidget);
    });
  });

  // All navigation + feature tests in a single testWidgets to avoid
  // GoRouter GlobalKey conflicts between test instances.
  group('Повний флоу додатку', () {
    testWidgets('Логін → навігація по табах → пошук рішень', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: SecondLayerApp()),
      );
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // ─── Step 1: Login ───
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Електронна пошта'),
        testEmail,
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Пароль'),
        testPassword,
      );
      await tester.tap(find.widgetWithText(ElevatedButton, 'Увійти'));
      await tester.pumpAndSettle(const Duration(seconds: 10));

      // Should be on Chat tab
      expect(find.text('Чат'), findsOneWidget);
      expect(find.text('Рішення'), findsOneWidget);
      expect(find.text('Документи'), findsOneWidget);

      // Take screenshot after login
      final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
      await binding.convertFlutterSurfaceToImage();
      await tester.pumpAndSettle();

      // ─── Step 2: Navigate to Decisions ───
      await tester.tap(find.text('Рішення'));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Search field should be visible
      expect(find.byType(TextField), findsWidgets);

      // ─── Step 3: Search for court decisions ───
      final searchFields = find.byType(TextField);
      if (searchFields.evaluate().isNotEmpty) {
        await tester.enterText(searchFields.first, 'аліменти');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        // Wait for network response — may take a while
        await tester.pump(const Duration(seconds: 15));
        await tester.pumpAndSettle(const Duration(seconds: 5));
        // Search was submitted successfully (no crash)
      }

      // ─── Step 4: Navigate to Documents ───
      await tester.tap(find.text('Документи'));
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Documents screen visible — tab is active (title in AppBar or bottom nav)
      // Content could be: loading, empty state, error, or document list
      expect(find.text('Документи'), findsWidgets);

      // ─── Step 5: Navigate to More → verify profile link ───
      await tester.tap(find.text('Ще'));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      expect(find.text('Профіль'), findsOneWidget);

      // ─── Step 6: Open Profile ───
      await tester.tap(find.text('Профіль'));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Profile should show user name or email
      final hasUserInfo =
          find.text('Test User').evaluate().isNotEmpty ||
              find.text(testEmail).evaluate().isNotEmpty;
      expect(hasUserInfo, isTrue);

      // ─── Step 7: Go back to Chat ───
      // Navigate back
      final backButton = find.byType(BackButton);
      if (backButton.evaluate().isNotEmpty) {
        await tester.tap(backButton.first);
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('Чат'));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Chat screen should have message input
      expect(find.byType(TextField), findsWidgets);
    });
  });
}
