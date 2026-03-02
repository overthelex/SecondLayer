import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_uk.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('uk')];

  /// No description provided for @appTitle.
  ///
  /// In uk, this message translates to:
  /// **'SecondLayer'**
  String get appTitle;

  /// No description provided for @tabChat.
  ///
  /// In uk, this message translates to:
  /// **'Чат'**
  String get tabChat;

  /// No description provided for @tabDecisions.
  ///
  /// In uk, this message translates to:
  /// **'Рішення'**
  String get tabDecisions;

  /// No description provided for @tabLegislation.
  ///
  /// In uk, this message translates to:
  /// **'Законодавство'**
  String get tabLegislation;

  /// No description provided for @tabDocuments.
  ///
  /// In uk, this message translates to:
  /// **'Документи'**
  String get tabDocuments;

  /// No description provided for @tabMore.
  ///
  /// In uk, this message translates to:
  /// **'Ще'**
  String get tabMore;

  /// No description provided for @login.
  ///
  /// In uk, this message translates to:
  /// **'Увійти'**
  String get login;

  /// No description provided for @register.
  ///
  /// In uk, this message translates to:
  /// **'Зареєструватися'**
  String get register;

  /// No description provided for @email.
  ///
  /// In uk, this message translates to:
  /// **'Електронна пошта'**
  String get email;

  /// No description provided for @password.
  ///
  /// In uk, this message translates to:
  /// **'Пароль'**
  String get password;

  /// No description provided for @confirmPassword.
  ///
  /// In uk, this message translates to:
  /// **'Підтвердити пароль'**
  String get confirmPassword;

  /// No description provided for @forgotPassword.
  ///
  /// In uk, this message translates to:
  /// **'Забули пароль?'**
  String get forgotPassword;

  /// No description provided for @loginWithGoogle.
  ///
  /// In uk, this message translates to:
  /// **'Увійти з Google'**
  String get loginWithGoogle;

  /// No description provided for @orContinueWith.
  ///
  /// In uk, this message translates to:
  /// **'або продовжити з'**
  String get orContinueWith;

  /// No description provided for @noAccount.
  ///
  /// In uk, this message translates to:
  /// **'Немає акаунту?'**
  String get noAccount;

  /// No description provided for @hasAccount.
  ///
  /// In uk, this message translates to:
  /// **'Вже є акаунт?'**
  String get hasAccount;

  /// No description provided for @logout.
  ///
  /// In uk, this message translates to:
  /// **'Вийти'**
  String get logout;

  /// No description provided for @profile.
  ///
  /// In uk, this message translates to:
  /// **'Профіль'**
  String get profile;

  /// No description provided for @settings.
  ///
  /// In uk, this message translates to:
  /// **'Налаштування'**
  String get settings;

  /// No description provided for @search.
  ///
  /// In uk, this message translates to:
  /// **'Пошук'**
  String get search;

  /// No description provided for @searchDecisions.
  ///
  /// In uk, this message translates to:
  /// **'Пошук судових рішень...'**
  String get searchDecisions;

  /// No description provided for @searchLegislation.
  ///
  /// In uk, this message translates to:
  /// **'Пошук у законодавстві...'**
  String get searchLegislation;

  /// No description provided for @noResults.
  ///
  /// In uk, this message translates to:
  /// **'Нічого не знайдено'**
  String get noResults;

  /// No description provided for @loading.
  ///
  /// In uk, this message translates to:
  /// **'Завантаження...'**
  String get loading;

  /// No description provided for @error.
  ///
  /// In uk, this message translates to:
  /// **'Помилка'**
  String get error;

  /// No description provided for @retry.
  ///
  /// In uk, this message translates to:
  /// **'Спробувати знову'**
  String get retry;

  /// No description provided for @send.
  ///
  /// In uk, this message translates to:
  /// **'Надіслати'**
  String get send;

  /// No description provided for @typeMessage.
  ///
  /// In uk, this message translates to:
  /// **'Введіть повідомлення...'**
  String get typeMessage;

  /// No description provided for @newConversation.
  ///
  /// In uk, this message translates to:
  /// **'Нова розмова'**
  String get newConversation;

  /// No description provided for @conversations.
  ///
  /// In uk, this message translates to:
  /// **'Розмови'**
  String get conversations;

  /// No description provided for @thinking.
  ///
  /// In uk, this message translates to:
  /// **'Аналізую...'**
  String get thinking;

  /// No description provided for @planReview.
  ///
  /// In uk, this message translates to:
  /// **'Перегляд плану'**
  String get planReview;

  /// No description provided for @budgetQuick.
  ///
  /// In uk, this message translates to:
  /// **'Швидко'**
  String get budgetQuick;

  /// No description provided for @budgetStandard.
  ///
  /// In uk, this message translates to:
  /// **'Стандарт'**
  String get budgetStandard;

  /// No description provided for @budgetDeep.
  ///
  /// In uk, this message translates to:
  /// **'Глибоко'**
  String get budgetDeep;

  /// No description provided for @documents.
  ///
  /// In uk, this message translates to:
  /// **'Документи'**
  String get documents;

  /// No description provided for @upload.
  ///
  /// In uk, this message translates to:
  /// **'Завантажити'**
  String get upload;

  /// No description provided for @uploading.
  ///
  /// In uk, this message translates to:
  /// **'Завантаження...'**
  String get uploading;

  /// No description provided for @clients.
  ///
  /// In uk, this message translates to:
  /// **'Клієнти'**
  String get clients;

  /// No description provided for @matters.
  ///
  /// In uk, this message translates to:
  /// **'Справи'**
  String get matters;

  /// No description provided for @timeTracking.
  ///
  /// In uk, this message translates to:
  /// **'Облік часу'**
  String get timeTracking;

  /// No description provided for @billing.
  ///
  /// In uk, this message translates to:
  /// **'Білінг'**
  String get billing;

  /// No description provided for @insufficientBalance.
  ///
  /// In uk, this message translates to:
  /// **'Недостатньо коштів на балансі'**
  String get insufficientBalance;

  /// No description provided for @networkError.
  ///
  /// In uk, this message translates to:
  /// **'Помилка мережі. Перевірте підключення.'**
  String get networkError;

  /// No description provided for @sessionExpired.
  ///
  /// In uk, this message translates to:
  /// **'Сесія закінчилася. Увійдіть знову.'**
  String get sessionExpired;

  /// No description provided for @allCourts.
  ///
  /// In uk, this message translates to:
  /// **'Всі суди'**
  String get allCourts;

  /// No description provided for @supremeCourt.
  ///
  /// In uk, this message translates to:
  /// **'Верховний Суд'**
  String get supremeCourt;

  /// No description provided for @appealCourt.
  ///
  /// In uk, this message translates to:
  /// **'Апеляція'**
  String get appealCourt;

  /// No description provided for @firstInstance.
  ///
  /// In uk, this message translates to:
  /// **'Перша інстанція'**
  String get firstInstance;

  /// No description provided for @dateFrom.
  ///
  /// In uk, this message translates to:
  /// **'Дата від'**
  String get dateFrom;

  /// No description provided for @dateTo.
  ///
  /// In uk, this message translates to:
  /// **'Дата до'**
  String get dateTo;

  /// No description provided for @filters.
  ///
  /// In uk, this message translates to:
  /// **'Фільтри'**
  String get filters;

  /// No description provided for @apply.
  ///
  /// In uk, this message translates to:
  /// **'Застосувати'**
  String get apply;

  /// No description provided for @reset.
  ///
  /// In uk, this message translates to:
  /// **'Скинути'**
  String get reset;

  /// No description provided for @cancel.
  ///
  /// In uk, this message translates to:
  /// **'Скасувати'**
  String get cancel;

  /// No description provided for @delete.
  ///
  /// In uk, this message translates to:
  /// **'Видалити'**
  String get delete;

  /// No description provided for @save.
  ///
  /// In uk, this message translates to:
  /// **'Зберегти'**
  String get save;

  /// No description provided for @close.
  ///
  /// In uk, this message translates to:
  /// **'Закрити'**
  String get close;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['uk'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'uk':
      return AppLocalizationsUk();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
