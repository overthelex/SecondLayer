// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Ukrainian (`uk`).
class AppLocalizationsUk extends AppLocalizations {
  AppLocalizationsUk([String locale = 'uk']) : super(locale);

  @override
  String get appTitle => 'SecondLayer';

  @override
  String get tabChat => 'Чат';

  @override
  String get tabDecisions => 'Рішення';

  @override
  String get tabLegislation => 'Законодавство';

  @override
  String get tabDocuments => 'Документи';

  @override
  String get tabMore => 'Ще';

  @override
  String get login => 'Увійти';

  @override
  String get register => 'Зареєструватися';

  @override
  String get email => 'Електронна пошта';

  @override
  String get password => 'Пароль';

  @override
  String get confirmPassword => 'Підтвердити пароль';

  @override
  String get forgotPassword => 'Забули пароль?';

  @override
  String get loginWithGoogle => 'Увійти з Google';

  @override
  String get orContinueWith => 'або продовжити з';

  @override
  String get noAccount => 'Немає акаунту?';

  @override
  String get hasAccount => 'Вже є акаунт?';

  @override
  String get logout => 'Вийти';

  @override
  String get profile => 'Профіль';

  @override
  String get settings => 'Налаштування';

  @override
  String get search => 'Пошук';

  @override
  String get searchDecisions => 'Пошук судових рішень...';

  @override
  String get searchLegislation => 'Пошук у законодавстві...';

  @override
  String get noResults => 'Нічого не знайдено';

  @override
  String get loading => 'Завантаження...';

  @override
  String get error => 'Помилка';

  @override
  String get retry => 'Спробувати знову';

  @override
  String get send => 'Надіслати';

  @override
  String get typeMessage => 'Введіть повідомлення...';

  @override
  String get newConversation => 'Нова розмова';

  @override
  String get conversations => 'Розмови';

  @override
  String get thinking => 'Аналізую...';

  @override
  String get planReview => 'Перегляд плану';

  @override
  String get budgetQuick => 'Швидко';

  @override
  String get budgetStandard => 'Стандарт';

  @override
  String get budgetDeep => 'Глибоко';

  @override
  String get documents => 'Документи';

  @override
  String get upload => 'Завантажити';

  @override
  String get uploading => 'Завантаження...';

  @override
  String get clients => 'Клієнти';

  @override
  String get matters => 'Справи';

  @override
  String get timeTracking => 'Облік часу';

  @override
  String get billing => 'Білінг';

  @override
  String get insufficientBalance => 'Недостатньо коштів на балансі';

  @override
  String get networkError => 'Помилка мережі. Перевірте підключення.';

  @override
  String get sessionExpired => 'Сесія закінчилася. Увійдіть знову.';

  @override
  String get allCourts => 'Всі суди';

  @override
  String get supremeCourt => 'Верховний Суд';

  @override
  String get appealCourt => 'Апеляція';

  @override
  String get firstInstance => 'Перша інстанція';

  @override
  String get dateFrom => 'Дата від';

  @override
  String get dateTo => 'Дата до';

  @override
  String get filters => 'Фільтри';

  @override
  String get apply => 'Застосувати';

  @override
  String get reset => 'Скинути';

  @override
  String get cancel => 'Скасувати';

  @override
  String get delete => 'Видалити';

  @override
  String get save => 'Зберегти';

  @override
  String get close => 'Закрити';

  @override
  String documentPdfPageOf(int current, int total) {
    return 'Сторінка $current з $total';
  }

  @override
  String documentPdfRenderError(String error) {
    return 'Не вдалось відобразити PDF: $error';
  }

  @override
  String get documentOpenInBrowser => 'Відкрити у браузері';

  @override
  String get documentOpenPdf => 'Відкрити PDF';

  @override
  String get documentImageLoadError => 'Не вдалось завантажити зображення';

  @override
  String get documentEmpty => 'Документ порожній';

  @override
  String documentItemOf(int current, int total) {
    return '$current з $total';
  }

  @override
  String get documentsEmpty => 'Немає документів';

  @override
  String get documentsEmptySubtitle => 'Натисніть + щоб завантажити файл';

  @override
  String get documentDeleteConfirm => 'Видалити документ?';
}
