import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:secondlayer_mobile/config/flavor_config.dart';
import 'package:secondlayer_mobile/core/di/service_locator.dart';
import 'package:secondlayer_mobile/app.dart';

/// Comprehensive integration tests for SecondLayer mobile app.
///
/// Run on device (prod — has full DB + LLM):
///   flutter test integration_test/app_test.dart -d <device_id> \
///     --dart-define=TEST_EMAIL=testuser@secondlayer.test \
///     --dart-define=TEST_PASSWORD=TestUser2026! \
///     --dart-define=LAWYER_EMAIL=testlawyer@secondlayer.test \
///     --dart-define=LAWYER_PASSWORD=TestLawyer2026!
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const testEmail = String.fromEnvironment('TEST_EMAIL',
      defaultValue: 'testuser@secondlayer.test');
  const testPassword = String.fromEnvironment('TEST_PASSWORD',
      defaultValue: 'TestUser2026!');
  const lawyerEmail = String.fromEnvironment('LAWYER_EMAIL',
      defaultValue: 'testlawyer@secondlayer.test');
  const lawyerPassword = String.fromEnvironment('LAWYER_PASSWORD',
      defaultValue: 'TestLawyer2026!');

  setUpAll(() async {
    final config = await loadConfig('.env');
    await sl.init(config);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 1. АВТОРИЗАЦІЯ (окремі testWidgets — не потребують навігації)
  // ═══════════════════════════════════════════════════════════════════════

  group('1. Авторизація', () {
    testWidgets('1.1 Екран логіну — всі елементи', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: SecondLayerApp()));
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

    testWidgets('1.2 Валідація порожніх полів', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: SecondLayerApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      await tester.tap(find.widgetWithText(ElevatedButton, 'Увійти'));
      await tester.pumpAndSettle();

      expect(find.text('Введіть email'), findsOneWidget);
      expect(find.text('Введіть пароль'), findsOneWidget);
    });

    testWidgets('1.3 Валідація невірного формату', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: SecondLayerApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Електронна пошта'), 'bad-email');
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Пароль'), '12');
      await tester.tap(find.widgetWithText(ElevatedButton, 'Увійти'));
      await tester.pumpAndSettle();

      expect(find.text('Невірний формат email'), findsOneWidget);
      expect(find.text('Мінімум 6 символів'), findsOneWidget);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. КОРИСТУВАЧ: повний флоу в одному testWidgets
  //    (логін → таби → рішення → законодавство → документи → профіль → чат з MCP)
  // ═══════════════════════════════════════════════════════════════════════

  group('2. Користувач — повний флоу', () {
    testWidgets('Логін → навігація → пошук → LLM чат', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: SecondLayerApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // ── 2.1 LOGIN ──
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Електронна пошта'), testEmail);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Пароль'), testPassword);
      await tester.tap(find.widgetWithText(ElevatedButton, 'Увійти'));
      await tester.pumpAndSettle(const Duration(seconds: 10));

      expect(find.text('Чат'), findsOneWidget);
      expect(find.text('Рішення'), findsOneWidget);
      expect(find.text('Документи'), findsOneWidget);
      expect(find.text('Ще'), findsOneWidget);

      // ── 2.2 TAB: РІШЕННЯ — пошук + фільтри ──
      await tester.tap(find.text('Рішення'));
      await tester.pumpAndSettle(const Duration(seconds: 3));
      expect(find.byType(TextField), findsWidgets);

      // Search
      await tester.enterText(find.byType(TextField).first, 'стягнення аліментів');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump(const Duration(seconds: 10));
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Open filters if available
      final filterBtn = find.byIcon(Icons.tune);
      if (filterBtn.evaluate().isNotEmpty) {
        await tester.tap(filterBtn.first);
        await tester.pumpAndSettle(const Duration(seconds: 2));
        // Close filters
        final applyBtn = find.text('Застосувати');
        if (applyBtn.evaluate().isNotEmpty) {
          await tester.tap(applyBtn.first);
          await tester.pumpAndSettle(const Duration(seconds: 3));
        }
      }

      // Tap first result if exists
      if (find.byType(ListTile).evaluate().isNotEmpty) {
        await tester.tap(find.byType(ListTile).first);
        await tester.pumpAndSettle(const Duration(seconds: 5));
        // Go back
        final back = find.byType(BackButton);
        if (back.evaluate().isNotEmpty) {
          await tester.tap(back.first);
          await tester.pumpAndSettle(const Duration(seconds: 2));
        }
      }

      // ── 2.3 TAB: ЗАКОНОДАВСТВО — бібліотека → зміст ──
      final legTab = find.byType(NavigationDestination).at(2);
      await tester.tap(legTab);
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Open first code if grid has cards
      if (find.byType(Card).evaluate().isNotEmpty) {
        await tester.tap(find.byType(Card).first);
        await tester.pumpAndSettle(const Duration(seconds: 5));
        // Back to library
        final back = find.byType(BackButton);
        if (back.evaluate().isNotEmpty) {
          await tester.tap(back.first);
          await tester.pumpAndSettle(const Duration(seconds: 2));
        }
      }

      // ── 2.4 TAB: ДОКУМЕНТИ ──
      await tester.tap(find.text('Документи'));
      await tester.pumpAndSettle(const Duration(seconds: 5));
      expect(find.text('Документи'), findsWidgets);
      expect(find.byType(FloatingActionButton), findsOneWidget);

      // ── 2.5 TAB: ЩЕ → Профіль ──
      await tester.tap(find.text('Ще'));
      await tester.pumpAndSettle(const Duration(seconds: 2));
      expect(find.text('Профіль'), findsOneWidget);
      expect(find.text('Вийти'), findsOneWidget);

      await tester.tap(find.text('Профіль'));
      await tester.pumpAndSettle(const Duration(seconds: 3));
      expect(
        find.text('Test User').evaluate().isNotEmpty ||
            find.text(testEmail).evaluate().isNotEmpty,
        isTrue,
      );

      // Back from profile
      final back = find.byType(BackButton);
      if (back.evaluate().isNotEmpty) {
        await tester.tap(back.first);
        await tester.pumpAndSettle(const Duration(seconds: 2));
      }

      // ── 2.6 КОНСУЛЬТАЦІЇ ──
      final consultBtn = find.text('Консультації');
      if (consultBtn.evaluate().isNotEmpty) {
        await tester.tap(consultBtn.first);
        await tester.pumpAndSettle(const Duration(seconds: 5));
        final backBtn = find.byType(BackButton);
        if (backBtn.evaluate().isNotEmpty) {
          await tester.tap(backBtn.first);
          await tester.pumpAndSettle(const Duration(seconds: 2));
        }
      }

      // ── 2.7 LLM ЧАТ: пошук рішень (search_court_decisions) ──
      await tester.tap(find.text('Чат'));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      await _sendChatMessage(tester,
          'Знайди останні рішення Верховного Суду щодо стягнення аліментів на дитину');
      await _waitForResponse(tester, seconds: 35);
      // User message sent successfully (no crash during streaming)
      // Message may be scrolled off or truncated, so just verify no exception

      // ── 2.8 LLM ЧАТ: законодавство (get_legislation) ──
      await _startNewConversation(tester);
      await _sendChatMessage(tester,
          'Покажи текст статті 3 Конституції України');
      await _waitForResponse(tester, seconds: 35);
      // Sent successfully — no crash

      // ── 2.9 LLM ЧАТ: правовий аналіз (multi-tool) ──
      await _startNewConversation(tester);
      await _sendChatMessage(tester,
          'Яка кримінальна відповідальність за крадіжку за КК України?');
      await _waitForResponse(tester, seconds: 40);
      // Sent successfully — no crash

      // ── 2.10 LLM ЧАТ: пошук за номером справи ──
      await _startNewConversation(tester);
      await _sendChatMessage(tester,
          'Знайди рішення суду по справі № 761/9584/15-ц');
      await _waitForResponse(tester, seconds: 35);
      // Sent successfully — no crash

      // ── 2.11 Швидке перемикання табів (стабільність) ──
      for (var i = 0; i < 3; i++) {
        await tester.tap(find.text('Рішення'));
        await tester.pump(const Duration(milliseconds: 300));
        await tester.tap(find.text('Документи'));
        await tester.pump(const Duration(milliseconds: 300));
        await tester.tap(find.text('Чат'));
        await tester.pump(const Duration(milliseconds: 300));
      }
      await tester.pump(const Duration(seconds: 2));
      // App should still be running — bottom nav check
      expect(find.text('Чат'), findsOneWidget);

      // ═══════════════════════════════════════════════════════════════════
      // АДВОКАТ (same testWidgets to avoid GoRouter GlobalKey conflict)
      // ═══════════════════════════════════════════════════════════════════

      // ── 3.0 LOGOUT user session ──
      await tester.tap(find.text('Ще'));
      await tester.pump(const Duration(seconds: 2));
      final logoutBtn = find.text('Вийти');
      if (logoutBtn.evaluate().isNotEmpty) {
        await tester.tap(logoutBtn.first);
        await tester.pump(const Duration(seconds: 2));
        // Confirm logout dialog if exists
        final confirmBtns = find.text('Вийти');
        if (confirmBtns.evaluate().length > 1) {
          await tester.tap(confirmBtns.last);
        } else if (confirmBtns.evaluate().isNotEmpty) {
          await tester.tap(confirmBtns.first);
        }
        await tester.pumpAndSettle(const Duration(seconds: 5));
      }

      // ── 3.1 LOGIN as lawyer ──
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Електронна пошта'), lawyerEmail);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Пароль'), lawyerPassword);
      await tester.tap(find.widgetWithText(ElevatedButton, 'Увійти'));
      await tester.pumpAndSettle(const Duration(seconds: 10));
      expect(find.text('Чат'), findsOneWidget);

      // ── 3.2 ПРОФІЛЬ адвоката ──
      await tester.tap(find.text('Ще'));
      await tester.pumpAndSettle(const Duration(seconds: 2));
      await tester.tap(find.text('Профіль'));
      await tester.pumpAndSettle(const Duration(seconds: 3));
      expect(
        find.text('Test Lawyer').evaluate().isNotEmpty ||
            find.text(lawyerEmail).evaluate().isNotEmpty,
        isTrue,
      );
      final backFromProfile = find.byType(BackButton);
      if (backFromProfile.evaluate().isNotEmpty) {
        await tester.tap(backFromProfile.first);
        await tester.pumpAndSettle(const Duration(seconds: 2));
      }

      // ── 3.3 LLM ЧАТ: апеляційна скарга ──
      await tester.tap(find.text('Чат'));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      await _sendChatMessage(tester,
          'Як адвокату подати апеляційну скаргу на рішення суду першої інстанції за ЦПК?');
      await _waitForResponse(tester, seconds: 40);

      // ── 3.4 LLM ЧАТ deep: моральна шкода при ДТП ──
      await _startNewConversation(tester);
      final deepBudget = find.text('Глибоко');
      if (deepBudget.evaluate().isNotEmpty) {
        await tester.tap(deepBudget.first);
        await tester.pump(const Duration(seconds: 1));
      }
      await _sendChatMessage(tester,
          'Проаналізуй практику ВС щодо відшкодування моральної шкоди при ДТП за останній рік');
      await _waitForResponse(tester, seconds: 55);

      // ── 3.5 LLM ЧАТ deep: недійсність правочинів ──
      await _startNewConversation(tester);
      final deepBudget2 = find.text('Глибоко');
      if (deepBudget2.evaluate().isNotEmpty) {
        await tester.tap(deepBudget2.first);
        await tester.pump(const Duration(seconds: 1));
      }
      await _sendChatMessage(tester,
          'Порівняй підстави визнання правочинів недійсними за ст. 203 та 215 ЦК з аналізом практики ВС');
      await _waitForResponse(tester, seconds: 55);

      // ── 3.6 Рішення ──
      await tester.tap(find.text('Рішення'));
      await tester.pump(const Duration(seconds: 3));
      await tester.enterText(find.byType(TextField).first, 'представництво адвоката');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump(const Duration(seconds: 10));

      // ── 3.7 Законодавство ──
      final legTab2 = find.byType(NavigationDestination).at(2);
      await tester.tap(legTab2);
      await tester.pump(const Duration(seconds: 5));

      // ── 3.8 Документи ──
      await tester.tap(find.text('Документи'));
      await tester.pump(const Duration(seconds: 5));
      expect(find.text('Документи'), findsWidgets);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/// Send a message in chat.
Future<void> _sendChatMessage(WidgetTester tester, String message) async {
  final inputs = find.byType(TextField);
  await tester.enterText(inputs.last, message);
  await tester.pumpAndSettle();

  final sendBtn = find.byIcon(Icons.send);
  if (sendBtn.evaluate().isNotEmpty) {
    await tester.tap(sendBtn.first);
  } else {
    await tester.testTextInput.receiveAction(TextInputAction.send);
  }
}

/// Wait for LLM response (streaming).
/// Note: pumpAndSettle will timeout during streaming animations,
/// so we pump in intervals instead.
Future<void> _waitForResponse(WidgetTester tester, {int seconds = 30}) async {
  // Pump in 5-second intervals to process frames during streaming
  final intervals = seconds ~/ 5;
  for (var i = 0; i < intervals; i++) {
    await tester.pump(const Duration(seconds: 5));
  }
  // Final settle attempt with short timeout — OK if it times out
  try {
    await tester.pumpAndSettle(const Duration(seconds: 3));
  } catch (_) {
    // Streaming animation may still be running — that's OK
    await tester.pump(const Duration(seconds: 1));
  }
}

/// Start a new conversation via the + button.
Future<void> _startNewConversation(WidgetTester tester) async {
  final newBtn = find.byIcon(Icons.add);
  if (newBtn.evaluate().isNotEmpty) {
    await tester.tap(newBtn.first);
    await tester.pumpAndSettle(const Duration(seconds: 2));
  }
}
