import { useLocaleStore } from '../stores/localeStore';

export type Locale = 'uk' | 'en' | 'de' | 'es';

export const loginTranslations: Record<Locale, Record<string, string>> = {
  uk: {
    // Header
    tagline: 'Для юридичних фірм',
    headline1: 'Правовий аналіз.',
    headline2: 'На рівні партнера.',
    description: 'AI-платформа для юридичних фірм та корпоративних юристів: аналіз справ, пошук по рішеннях судів, моніторинг законодавства.',
    feature01: 'Семантичний пошук по мільйонам судових рішень',
    feature02: 'Аналіз практики і правових позицій',
    feature03: 'Моніторинг змін у законодавстві',
    feature04: 'Підготовка правових позицій з джерелами',
    // Stats
    statDecisions: 'судових рішень',
    statSessions: 'судових засідань',
    statRegistries: 'записів реєстрів',
    // Auth
    loginTitle: 'Увійти',
    registerTitle: 'Створити акаунт',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Пароль',
    namePlaceholder: "Ім'я (опціонально)",
    loginButton: 'Увійти',
    registerButton: 'Створити акаунт',
    forgotPassword: 'Забули пароль?',
    noAccount: 'Немає акаунту?',
    hasAccount: 'Вже є акаунт?',
    createAccount: 'Створити',
    signIn: 'Увійти',
    // Auth methods
    passwordMethod: 'Пароль',
    hardwareKeyMethod: 'Фізичний ключ',
    phoneKeyMethod: 'Ключ в телефоні',
    // OAuth
    googleAuth: 'Google',
    diiaAuth: 'Дія',
    ssoAuth: 'SSO',
    // Errors
    enterEmailPassword: 'Введіть email та пароль',
    invalidCredentials: 'Невірний email або пароль',
    registrationRequired: 'Для реєстрації необхідно прийняти всі документи',
    loginSuccess: 'Вхід виконано успішно!',
    registrationSuccess: 'Реєстрацію завершено! Перевірте email для підтвердження акаунту.',
    loginError: 'Помилка входу',
    registrationError: 'Помилка реєстрації',
    authError: 'Помилка автентифікації',
    authCancelled: 'Автентифікацію скасовано',
    authenticating: 'Автентифікація',
    // Consents
    acceptTerms: 'Публічна оферта',
    acceptPrivacy: 'Політика конфіденційності',
    acceptDpa: 'Угода про обробку даних',
    // SSO
    ssoEmailPlaceholder: 'SSO Email',
    ssoPasswordPlaceholder: 'SSO Пароль',
    ssoLoginButton: 'Увійти через SSO',
    // Footer
    startFree: 'Почніть безкоштовно',
    freeCredits: '50 кредитів',
    freeCreditsDesc: 'при реєстрації',
    referralBonus: 'Запросіть друга',
    referralBonusDesc: '+15 кредитів',
    // Blog
    readBlog: 'Блог',
    // Diia
    diiaWaiting: 'Відкрийте Дію та підтвердіть вхід',
    diiaCancel: 'Скасувати',
    diiaExpired: 'Сесія Дії закінчилась. Спробуйте ще раз.',
    // Welcome
    welcomeTitle: 'Вітаємо у LEX!',
    welcomeDesc: 'Ваш AI-юрист готовий до роботи',
    welcomeStart: 'Почати',
    // Password strength
    strengthWeak: 'Слабкий',
    strengthMedium: 'Середній',
    strengthStrong: 'Надійний',
    // Promo banner
    promoNew: 'НОВИМ',
    promoDesc: 'Дізнайтесь про умови та реферальну програму',
    // Bottom nav
    newsLink: 'Новини',
    investorsLink: 'Для інвесторів',
    // Auth subtitle
    authSubtitleLogin: 'Оберіть зручний спосіб автентифікації',
    authSubtitleRegister: 'Зареєструйтесь для початку роботи',
    // Divider
    orDivider: 'або',
    // Auth method tabs
    tabPassword: 'Пароль',
    tabKey: 'Ключ',
    tabPhone: 'Телефон',
    // Form labels
    nameLabel: "Ім'я",
    namePlaceholderExample: 'Іван Петренко',
    passwordLabel: 'Пароль',
    // Password strength messages
    strengthWeakDesc: 'Слабкий — додайте великі літери, цифри або спецсимволи',
    strengthMediumDesc: 'Середній пароль',
    strengthStrongDesc: 'Надійний пароль',
    // Hardware key
    hardwareKeyTitle: 'Підключіть ключ безпеки',
    hardwareKeyDesc: 'Вставте USB-ключ або використайте NFC',
    // Phone key
    phoneKeyTitle: 'Вхід через телефон',
    phoneKeyDesc: 'Браузер покаже QR-код для сканування',
    // GDPR badge
    gdprDesc: 'Захист персональних даних',
    gdprCompliance: 'Відповідає Регламенту ЄС 2016/679',
    // Footer legal links
    footerTerms: 'Умови',
    footerOffer: 'Оферта',
    footerPrivacy: 'Конфіденційність',
    footerDpa: 'DPA',
    footerAiPolicy: 'Політика AI',
    footerAiTransparency: 'Прозорість AI',
    // Registration consent
    consentRequired: 'Для реєстрації необхідно прийняти:',
    consentTerms: 'Умови використання',
    consentOffer: 'Публічну оферту',
    consentAnd: ' та ',
    consentPrivacy: 'Політику конфіденційності',
    consentDpa: 'Угоду про обробку даних (DPA)',
    // SSO form
    ssoLoginButtonText: 'Увійти',
    // Welcome modal
    welcomeModalTitle: 'Ласкаво просимо',
    welcomeModalDesc: 'Ознайомтесь з умовами платформи та реферальною програмою',
    legalDocsTitle: 'Правові документи',
    docOffer: 'Публічна оферта',
    docOfferDesc: 'Договір між вами та платформою',
    docTerms: 'Умови використання',
    docTermsDesc: 'Правила користування сервісом',
    docPrivacy: 'Політика конфіденційності',
    docPrivacyDesc: 'Як ми захищаємо ваші дані',
    docDpa: 'Угода про обробку даних (DPA)',
    docDpaDesc: 'Відповідність GDPR',
    docRefund: 'Політика повернення коштів',
    docRefundDesc: 'Умови повернення оплати',
    // Referral program
    referralTitle: 'Реферальна програма',
    referralHeadline: 'Запрошуйте колег — отримуйте бонуси',
    referralDesc: 'Поділіться реферальним посиланням з колегами-юристами. За кожного нового користувача, який зареєструється та поповнить рахунок, ви отримаєте бонус на баланс платформи.',
    referralItem1: 'Реферальне посилання доступне після реєстрації',
    referralItem2: 'Бонус нараховується автоматично',
    referralItem3: 'Для участі потрібна верифікація ФОП, ТОВ або адвоката',
    referralCta: 'Зареєструватися',
  },
  en: {
    tagline: 'For Law Firms',
    headline1: 'Legal Analysis.',
    headline2: 'Partner Level.',
    description: 'AI platform for law firms and corporate counsel: case analysis, court decision search, legislation monitoring across 12 jurisdictions.',
    feature01: 'Semantic search across millions of court decisions',
    feature02: 'Case law and legal position analysis',
    feature03: 'Legislative change monitoring',
    feature04: 'Legal positions with cited sources',
    statDecisions: 'court decisions',
    statSessions: 'court sessions',
    statRegistries: 'registry records',
    loginTitle: 'Sign In',
    registerTitle: 'Create Account',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    namePlaceholder: 'Name (optional)',
    loginButton: 'Sign In',
    registerButton: 'Create Account',
    forgotPassword: 'Forgot password?',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
    createAccount: 'Create',
    signIn: 'Sign In',
    passwordMethod: 'Password',
    hardwareKeyMethod: 'Hardware Key',
    phoneKeyMethod: 'Phone Key',
    googleAuth: 'Google',
    diiaAuth: 'Diia',
    ssoAuth: 'SSO',
    enterEmailPassword: 'Enter email and password',
    invalidCredentials: 'Invalid email or password',
    registrationRequired: 'You must accept all documents to register',
    loginSuccess: 'Login successful!',
    registrationSuccess: 'Registration complete! Check your email to confirm your account.',
    loginError: 'Login error',
    registrationError: 'Registration error',
    authError: 'Authentication error',
    authCancelled: 'Authentication cancelled',
    authenticating: 'Authenticating',
    acceptTerms: 'Terms of Service',
    acceptPrivacy: 'Privacy Policy',
    acceptDpa: 'Data Processing Agreement',
    ssoEmailPlaceholder: 'SSO Email',
    ssoPasswordPlaceholder: 'SSO Password',
    ssoLoginButton: 'Sign in with SSO',
    startFree: 'Start for free',
    freeCredits: '50 credits',
    freeCreditsDesc: 'on registration',
    referralBonus: 'Invite a friend',
    referralBonusDesc: '+15 credits',
    readBlog: 'Blog',
    diiaWaiting: 'Open Diia and confirm login',
    diiaCancel: 'Cancel',
    diiaExpired: 'Diia session expired. Please try again.',
    welcomeTitle: 'Welcome to LEX!',
    welcomeDesc: 'Your AI lawyer is ready',
    welcomeStart: 'Start',
    strengthWeak: 'Weak',
    strengthMedium: 'Medium',
    strengthStrong: 'Strong',
    // Promo banner
    promoNew: 'NEW',
    promoDesc: 'Learn about terms and referral program',
    // Bottom nav
    newsLink: 'News',
    investorsLink: 'For Investors',
    // Auth subtitle
    authSubtitleLogin: 'Choose your authentication method',
    authSubtitleRegister: 'Register to get started',
    // Divider
    orDivider: 'or',
    // Auth method tabs
    tabPassword: 'Password',
    tabKey: 'Key',
    tabPhone: 'Phone',
    // Form labels
    nameLabel: 'Name',
    namePlaceholderExample: 'John Doe',
    passwordLabel: 'Password',
    // Password strength messages
    strengthWeakDesc: 'Weak — add uppercase letters, numbers or special characters',
    strengthMediumDesc: 'Medium password',
    strengthStrongDesc: 'Strong password',
    // Hardware key
    hardwareKeyTitle: 'Connect your security key',
    hardwareKeyDesc: 'Insert USB key or use NFC',
    // Phone key
    phoneKeyTitle: 'Phone login',
    phoneKeyDesc: 'Browser will show QR code to scan',
    // GDPR badge
    gdprDesc: 'Personal data protection',
    gdprCompliance: 'Compliant with EU Regulation 2016/679',
    // Footer legal links
    footerTerms: 'Terms',
    footerOffer: 'Offer',
    footerPrivacy: 'Privacy',
    footerDpa: 'DPA',
    footerAiPolicy: 'AI Policy',
    footerAiTransparency: 'AI Transparency',
    // Registration consent
    consentRequired: 'To register, you must accept:',
    consentTerms: 'Terms of Use',
    consentOffer: 'Public Offer',
    consentAnd: ' and ',
    consentPrivacy: 'Privacy Policy',
    consentDpa: 'Data Processing Agreement (DPA)',
    // SSO form
    ssoLoginButtonText: 'Sign In',
    // Welcome modal
    welcomeModalTitle: 'Welcome',
    welcomeModalDesc: 'Review platform terms and referral program',
    legalDocsTitle: 'Legal Documents',
    docOffer: 'Public Offer',
    docOfferDesc: 'Agreement between you and the platform',
    docTerms: 'Terms of Use',
    docTermsDesc: 'Service usage rules',
    docPrivacy: 'Privacy Policy',
    docPrivacyDesc: 'How we protect your data',
    docDpa: 'Data Processing Agreement (DPA)',
    docDpaDesc: 'GDPR compliance',
    docRefund: 'Refund Policy',
    docRefundDesc: 'Payment refund conditions',
    referralTitle: 'Referral Program',
    referralHeadline: 'Invite colleagues — earn bonuses',
    referralDesc: 'Share your referral link with fellow lawyers. For every new user who registers and tops up their account, you will receive a bonus to your platform balance.',
    referralItem1: 'Referral link available after registration',
    referralItem2: 'Bonus is credited automatically',
    referralItem3: 'Verification as a sole proprietor, LLC or attorney required',
    referralCta: 'Register',
  },
  de: {
    tagline: 'Fur Anwaltskanzleien',
    headline1: 'Rechtsanalyse.',
    headline2: 'Auf Partnerniveau.',
    description: 'KI-Plattform fur Kanzleien und Unternehmensjuristen: Fallanalyse, Suche in Gerichtsentscheidungen, Gesetzgebungsmonitoring uber 12 Jurisdiktionen.',
    feature01: 'Semantische Suche uber Millionen von Gerichtsentscheidungen',
    feature02: 'Analyse von Rechtsprechung und Rechtspositionen',
    feature03: 'Monitoring von Gesetzesanderungen',
    feature04: 'Rechtspositionen mit zitierten Quellen',
    statDecisions: 'Gerichtsentscheidungen',
    statSessions: 'Gerichtssitzungen',
    statRegistries: 'Registereintrage',
    loginTitle: 'Anmelden',
    registerTitle: 'Konto erstellen',
    emailPlaceholder: 'E-Mail',
    passwordPlaceholder: 'Passwort',
    namePlaceholder: 'Name (optional)',
    loginButton: 'Anmelden',
    registerButton: 'Konto erstellen',
    forgotPassword: 'Passwort vergessen?',
    noAccount: 'Kein Konto?',
    hasAccount: 'Bereits ein Konto?',
    createAccount: 'Erstellen',
    signIn: 'Anmelden',
    passwordMethod: 'Passwort',
    hardwareKeyMethod: 'Hardware-Schlussel',
    phoneKeyMethod: 'Telefon-Schlussel',
    googleAuth: 'Google',
    diiaAuth: 'Diia',
    ssoAuth: 'SSO',
    enterEmailPassword: 'E-Mail und Passwort eingeben',
    invalidCredentials: 'Ungultige E-Mail oder Passwort',
    registrationRequired: 'Fur die Registrierung mussen alle Dokumente akzeptiert werden',
    loginSuccess: 'Anmeldung erfolgreich!',
    registrationSuccess: 'Registrierung abgeschlossen! Uberprufen Sie Ihre E-Mail zur Kontobestatigung.',
    loginError: 'Anmeldefehler',
    registrationError: 'Registrierungsfehler',
    authError: 'Authentifizierungsfehler',
    authCancelled: 'Authentifizierung abgebrochen',
    authenticating: 'Authentifizierung',
    acceptTerms: 'Nutzungsbedingungen',
    acceptPrivacy: 'Datenschutzerklarung',
    acceptDpa: 'Datenverarbeitungsvereinbarung',
    ssoEmailPlaceholder: 'SSO E-Mail',
    ssoPasswordPlaceholder: 'SSO Passwort',
    ssoLoginButton: 'Mit SSO anmelden',
    startFree: 'Kostenlos starten',
    freeCredits: '50 Credits',
    freeCreditsDesc: 'bei Registrierung',
    referralBonus: 'Freund einladen',
    referralBonusDesc: '+15 Credits',
    readBlog: 'Blog',
    diiaWaiting: 'Offnen Sie Diia und bestatigen Sie die Anmeldung',
    diiaCancel: 'Abbrechen',
    diiaExpired: 'Diia-Sitzung abgelaufen. Bitte versuchen Sie es erneut.',
    welcomeTitle: 'Willkommen bei LEX!',
    welcomeDesc: 'Ihr KI-Anwalt ist bereit',
    welcomeStart: 'Starten',
    strengthWeak: 'Schwach',
    strengthMedium: 'Mittel',
    strengthStrong: 'Stark',
    // Promo banner
    promoNew: 'NEU',
    promoDesc: 'Erfahren Sie mehr über Bedingungen und Empfehlungsprogramm',
    // Bottom nav
    newsLink: 'Nachrichten',
    investorsLink: 'Für Investoren',
    // Auth subtitle
    authSubtitleLogin: 'Wählen Sie Ihre Authentifizierungsmethode',
    authSubtitleRegister: 'Registrieren Sie sich, um loszulegen',
    // Divider
    orDivider: 'oder',
    // Auth method tabs
    tabPassword: 'Passwort',
    tabKey: 'Schlüssel',
    tabPhone: 'Telefon',
    // Form labels
    nameLabel: 'Name',
    namePlaceholderExample: 'Max Mustermann',
    passwordLabel: 'Passwort',
    // Password strength messages
    strengthWeakDesc: 'Schwach — Großbuchstaben, Zahlen oder Sonderzeichen hinzufügen',
    strengthMediumDesc: 'Mittleres Passwort',
    strengthStrongDesc: 'Starkes Passwort',
    // Hardware key
    hardwareKeyTitle: 'Schließen Sie Ihren Sicherheitsschlüssel an',
    hardwareKeyDesc: 'USB-Schlüssel einstecken oder NFC verwenden',
    // Phone key
    phoneKeyTitle: 'Anmeldung per Telefon',
    phoneKeyDesc: 'Der Browser zeigt einen QR-Code zum Scannen an',
    // GDPR badge
    gdprDesc: 'Schutz personenbezogener Daten',
    gdprCompliance: 'Konform mit EU-Verordnung 2016/679',
    // Footer legal links
    footerTerms: 'Bedingungen',
    footerOffer: 'Angebot',
    footerPrivacy: 'Datenschutz',
    footerDpa: 'DPA',
    footerAiPolicy: 'KI-Richtlinie',
    footerAiTransparency: 'KI-Transparenz',
    // Registration consent
    consentRequired: 'Für die Registrierung müssen Sie akzeptieren:',
    consentTerms: 'Nutzungsbedingungen',
    consentOffer: 'Öffentliches Angebot',
    consentAnd: ' und ',
    consentPrivacy: 'Datenschutzerklärung',
    consentDpa: 'Datenverarbeitungsvereinbarung (DPA)',
    // SSO form
    ssoLoginButtonText: 'Anmelden',
    // Welcome modal
    welcomeModalTitle: 'Willkommen',
    welcomeModalDesc: 'Überprüfen Sie die Plattformbedingungen und das Empfehlungsprogramm',
    legalDocsTitle: 'Rechtsdokumente',
    docOffer: 'Öffentliches Angebot',
    docOfferDesc: 'Vereinbarung zwischen Ihnen und der Plattform',
    docTerms: 'Nutzungsbedingungen',
    docTermsDesc: 'Regeln für die Nutzung des Dienstes',
    docPrivacy: 'Datenschutzerklärung',
    docPrivacyDesc: 'Wie wir Ihre Daten schützen',
    docDpa: 'Datenverarbeitungsvereinbarung (DPA)',
    docDpaDesc: 'GDPR-Konformität',
    docRefund: 'Rückerstattungsrichtlinie',
    docRefundDesc: 'Bedingungen für Rückerstattungen',
    referralTitle: 'Empfehlungsprogramm',
    referralHeadline: 'Laden Sie Kollegen ein — verdienen Sie Boni',
    referralDesc: 'Teilen Sie Ihren Empfehlungslink mit Anwaltskollegen. Für jeden neuen Benutzer, der sich registriert und sein Konto auflädt, erhalten Sie einen Bonus auf Ihr Plattformguthaben.',
    referralItem1: 'Empfehlungslink nach der Registrierung verfügbar',
    referralItem2: 'Bonus wird automatisch gutgeschrieben',
    referralItem3: 'Verifizierung als Einzelunternehmer, GmbH oder Anwalt erforderlich',
    referralCta: 'Registrieren',
  },
  es: {
    tagline: 'Para Despachos de Abogados',
    headline1: 'Análisis Jurídico.',
    headline2: 'Nivel de Socio.',
    description: 'Plataforma de IA para despachos de abogados y asesores jurídicos: análisis de casos, búsqueda de resoluciones judiciales, monitoreo legislativo en 12 jurisdicciones.',
    feature01: 'Búsqueda semántica en millones de resoluciones judiciales',
    feature02: 'Análisis de jurisprudencia y posiciones legales',
    feature03: 'Monitoreo de cambios legislativos',
    feature04: 'Posiciones legales con fuentes citadas',
    statDecisions: 'resoluciones judiciales',
    statSessions: 'sesiones judiciales',
    statRegistries: 'registros',
    loginTitle: 'Iniciar sesión',
    registerTitle: 'Crear cuenta',
    emailPlaceholder: 'Correo electrónico',
    passwordPlaceholder: 'Contraseña',
    namePlaceholder: 'Nombre (opcional)',
    loginButton: 'Iniciar sesión',
    registerButton: 'Crear cuenta',
    forgotPassword: '¿Olvidó su contraseña?',
    noAccount: '¿No tiene cuenta?',
    hasAccount: '¿Ya tiene cuenta?',
    createAccount: 'Crear',
    signIn: 'Iniciar sesión',
    passwordMethod: 'Contraseña',
    hardwareKeyMethod: 'Llave física',
    phoneKeyMethod: 'Llave del teléfono',
    googleAuth: 'Google',
    diiaAuth: 'Diia',
    ssoAuth: 'SSO',
    enterEmailPassword: 'Introduzca correo electrónico y contraseña',
    invalidCredentials: 'Correo o contraseña incorrectos',
    registrationRequired: 'Debe aceptar todos los documentos para registrarse',
    loginSuccess: '¡Inicio de sesión exitoso!',
    registrationSuccess: '¡Registro completado! Revise su correo para confirmar la cuenta.',
    loginError: 'Error de inicio de sesión',
    registrationError: 'Error de registro',
    authError: 'Error de autenticación',
    authCancelled: 'Autenticación cancelada',
    authenticating: 'Autenticando',
    acceptTerms: 'Términos de servicio',
    acceptPrivacy: 'Política de privacidad',
    acceptDpa: 'Acuerdo de procesamiento de datos',
    ssoEmailPlaceholder: 'Correo SSO',
    ssoPasswordPlaceholder: 'Contraseña SSO',
    ssoLoginButton: 'Iniciar sesión con SSO',
    startFree: 'Empiece gratis',
    freeCredits: '50 créditos',
    freeCreditsDesc: 'al registrarse',
    referralBonus: 'Invite a un amigo',
    referralBonusDesc: '+15 créditos',
    readBlog: 'Blog',
    diiaWaiting: 'Abra Diia y confirme el inicio de sesión',
    diiaCancel: 'Cancelar',
    diiaExpired: 'La sesión de Diia ha expirado. Inténtelo de nuevo.',
    welcomeTitle: '¡Bienvenido a LEX!',
    welcomeDesc: 'Su abogado con IA está listo',
    welcomeStart: 'Comenzar',
    strengthWeak: 'Débil',
    strengthMedium: 'Medio',
    strengthStrong: 'Fuerte',
    // Promo banner
    promoNew: 'NUEVO',
    promoDesc: 'Conozca los términos y el programa de referidos',
    // Bottom nav
    newsLink: 'Noticias',
    investorsLink: 'Para inversores',
    // Auth subtitle
    authSubtitleLogin: 'Elija su método de autenticación',
    authSubtitleRegister: 'Regístrese para comenzar',
    // Divider
    orDivider: 'o',
    // Auth method tabs
    tabPassword: 'Contraseña',
    tabKey: 'Llave',
    tabPhone: 'Teléfono',
    // Form labels
    nameLabel: 'Nombre',
    namePlaceholderExample: 'Juan García',
    passwordLabel: 'Contraseña',
    // Password strength messages
    strengthWeakDesc: 'Débil — agregue mayúsculas, números o caracteres especiales',
    strengthMediumDesc: 'Contraseña media',
    strengthStrongDesc: 'Contraseña fuerte',
    // Hardware key
    hardwareKeyTitle: 'Conecte su llave de seguridad',
    hardwareKeyDesc: 'Inserte la llave USB o use NFC',
    // Phone key
    phoneKeyTitle: 'Inicio de sesión por teléfono',
    phoneKeyDesc: 'El navegador mostrará un código QR para escanear',
    // GDPR badge
    gdprDesc: 'Protección de datos personales',
    gdprCompliance: 'Cumple con el Reglamento UE 2016/679',
    // Footer legal links
    footerTerms: 'Términos',
    footerOffer: 'Oferta',
    footerPrivacy: 'Privacidad',
    footerDpa: 'DPA',
    footerAiPolicy: 'Política de IA',
    footerAiTransparency: 'Transparencia IA',
    // Registration consent
    consentRequired: 'Para registrarse, debe aceptar:',
    consentTerms: 'Términos de uso',
    consentOffer: 'Oferta pública',
    consentAnd: ' y ',
    consentPrivacy: 'Política de privacidad',
    consentDpa: 'Acuerdo de procesamiento de datos (DPA)',
    // SSO form
    ssoLoginButtonText: 'Iniciar sesión',
    // Welcome modal
    welcomeModalTitle: 'Bienvenido',
    welcomeModalDesc: 'Revise los términos de la plataforma y el programa de referidos',
    legalDocsTitle: 'Documentos legales',
    docOffer: 'Oferta pública',
    docOfferDesc: 'Acuerdo entre usted y la plataforma',
    docTerms: 'Términos de uso',
    docTermsDesc: 'Reglas de uso del servicio',
    docPrivacy: 'Política de privacidad',
    docPrivacyDesc: 'Cómo protegemos sus datos',
    docDpa: 'Acuerdo de procesamiento de datos (DPA)',
    docDpaDesc: 'Cumplimiento del RGPD',
    docRefund: 'Política de reembolso',
    docRefundDesc: 'Condiciones de reembolso',
    referralTitle: 'Programa de referidos',
    referralHeadline: 'Invite colegas — obtenga bonos',
    referralDesc: 'Comparta su enlace de referido con colegas abogados. Por cada nuevo usuario que se registre y recargue su cuenta, recibirá un bono en su saldo de la plataforma.',
    referralItem1: 'Enlace de referido disponible después del registro',
    referralItem2: 'El bono se acredita automáticamente',
    referralItem3: 'Se requiere verificación como autónomo, empresa o abogado',
    referralCta: 'Registrarse',
  },
};

const SUPPORTED_LOCALES = ['uk', 'en', 'de', 'es'];

// Get locale from: URL ?lang= → localStorage lex_locale → localeStore (geo-detected) → default 'uk'
export function getLocale(): Locale {
  const params = new URLSearchParams(window.location.search);
  const langParam = params.get('lang');
  if (langParam && SUPPORTED_LOCALES.includes(langParam)) {
    localStorage.setItem('lex_locale', langParam);
    return langParam as Locale;
  }
  const stored = localStorage.getItem('lex_locale');
  if (stored && SUPPORTED_LOCALES.includes(stored)) {
    return stored as Locale;
  }
  // Fallback: read geo-detected language from localeStore (persisted in locale-storage)
  try {
    const localeStorage = localStorage.getItem('locale-storage');
    if (localeStorage) {
      const parsed = JSON.parse(localeStorage);
      const geoLang = parsed?.state?.language;
      if (geoLang && SUPPORTED_LOCALES.includes(geoLang)) {
        return geoLang as Locale;
      }
    }
  } catch {
    // ignore parse errors
  }
  return 'uk';
}

export function setLocale(locale: Locale) {
  localStorage.setItem('lex_locale', locale);
  const url = new URL(window.location.href);
  url.searchParams.set('lang', locale);
  window.history.replaceState({}, '', url.toString());
}

export function useLoginT() {
  const locale = getLocale();
  const t = loginTranslations[locale];
  return { t, locale, setLocale };
}

/**
 * Reactive version that re-renders when geo detection sets language.
 * Subscribes to localeStore so login page updates when async geo detection completes.
 */
export function useLoginPageT() {
  const storeLanguage = useLocaleStore((s) => s.language);
  const locale: Locale = SUPPORTED_LOCALES.includes(storeLanguage)
    ? (storeLanguage as Locale)
    : getLocale();
  const t = loginTranslations[locale];
  return { t, locale, setLocale };
}

/* ─── Forgot Password modal translations ─── */

const forgotPasswordStrings: Record<Locale, Record<string, string>> = {
  uk: {
    title: 'Відновлення паролю',
    description: 'Введіть email для отримання посилання на скидання паролю',
    enterEmail: 'Введіть email',
    sendError: 'Помилка надсилання',
    sendSuccess: 'Лист надіслано! Перевірте пошту.',
    sendFailedGeneric: 'Не вдалося надіслати лист',
    sendErrorToast: 'Помилка надсилання листа',
    cancel: 'Скасувати',
    send: 'Надіслати',
  },
  en: {
    title: 'Reset Password',
    description: 'Enter your email to receive a password reset link',
    enterEmail: 'Enter email',
    sendError: 'Send error',
    sendSuccess: 'Email sent! Check your inbox.',
    sendFailedGeneric: 'Failed to send email',
    sendErrorToast: 'Failed to send email',
    cancel: 'Cancel',
    send: 'Send',
  },
  de: {
    title: 'Passwort zurücksetzen',
    description: 'Geben Sie Ihre E-Mail ein, um einen Link zum Zurücksetzen zu erhalten',
    enterEmail: 'E-Mail eingeben',
    sendError: 'Sendefehler',
    sendSuccess: 'E-Mail gesendet! Überprüfen Sie Ihr Postfach.',
    sendFailedGeneric: 'E-Mail konnte nicht gesendet werden',
    sendErrorToast: 'Fehler beim Senden der E-Mail',
    cancel: 'Abbrechen',
    send: 'Senden',
  },
  es: {
    title: 'Restablecer contraseña',
    description: 'Introduzca su correo para recibir un enlace de restablecimiento',
    enterEmail: 'Introduzca correo electrónico',
    sendError: 'Error de envío',
    sendSuccess: '¡Correo enviado! Revise su bandeja de entrada.',
    sendFailedGeneric: 'No se pudo enviar el correo',
    sendErrorToast: 'Error al enviar el correo',
    cancel: 'Cancelar',
    send: 'Enviar',
  },
};

export function useForgotPasswordT() {
  const locale = getLocale();
  return { t: forgotPasswordStrings[locale] };
}

/* ─── GDPR modal translations ─── */

const gdprStrings: Record<Locale, Record<string, string>> = {
  uk: {
    title: 'Захист даних',
    subtitle: 'GDPR Compliance',
    intro: 'LEX AI відповідає вимогам',
    gdprName: 'Загального регламенту захисту даних (GDPR)',
    introEnd: 'Європейського Союзу.',
    cp1Title: 'Правова основа обробки', cp1Desc: 'Обробка даних лише за згодою або законною підставою',
    cp2Title: 'Право на доступ', cp2Desc: 'Запит копії ваших персональних даних',
    cp3Title: 'Право на видалення', cp3Desc: 'Видалення ваших даних за запитом',
    cp4Title: 'Портативність даних', cp4Desc: 'Експорт даних у машиночитаному форматі',
    cp5Title: 'Захист за замовчуванням', cp5Desc: 'Конфіденційність вбудована в архітектуру',
    cp6Title: 'Безпека даних', cp6Desc: 'Шифрування та контроль доступу',
    officialDocs: 'Офіційні документи',
    linkUkText: 'Регламент (ЄС) 2016/679 — Українська',
    understood: 'Зрозуміло',
  },
  en: {
    title: 'Data Protection',
    subtitle: 'GDPR Compliance',
    intro: 'LEX AI complies with the',
    gdprName: 'General Data Protection Regulation (GDPR)',
    introEnd: 'of the European Union.',
    cp1Title: 'Lawful basis for processing', cp1Desc: 'Data processing only with consent or lawful basis',
    cp2Title: 'Right of access', cp2Desc: 'Request a copy of your personal data',
    cp3Title: 'Right to erasure', cp3Desc: 'Deletion of your data upon request',
    cp4Title: 'Data portability', cp4Desc: 'Export your data in a machine-readable format',
    cp5Title: 'Privacy by design', cp5Desc: 'Privacy built into the architecture',
    cp6Title: 'Data security', cp6Desc: 'Encryption and access controls',
    officialDocs: 'Official documents',
    linkUkText: 'Regulation (EU) 2016/679 — Ukrainian',
    understood: 'Understood',
  },
  de: {
    title: 'Datenschutz',
    subtitle: 'DSGVO-Konformität',
    intro: 'LEX AI erfüllt die Anforderungen der',
    gdprName: 'Datenschutz-Grundverordnung (DSGVO)',
    introEnd: 'der Europäischen Union.',
    cp1Title: 'Rechtsgrundlage der Verarbeitung', cp1Desc: 'Datenverarbeitung nur mit Einwilligung oder Rechtsgrundlage',
    cp2Title: 'Auskunftsrecht', cp2Desc: 'Kopie Ihrer personenbezogenen Daten anfordern',
    cp3Title: 'Recht auf Löschung', cp3Desc: 'Löschung Ihrer Daten auf Anfrage',
    cp4Title: 'Datenübertragbarkeit', cp4Desc: 'Export Ihrer Daten in maschinenlesbarem Format',
    cp5Title: 'Datenschutz durch Design', cp5Desc: 'Datenschutz in die Architektur eingebaut',
    cp6Title: 'Datensicherheit', cp6Desc: 'Verschlüsselung und Zugriffskontrollen',
    officialDocs: 'Offizielle Dokumente',
    linkUkText: 'Verordnung (EU) 2016/679 — Ukrainisch',
    understood: 'Verstanden',
  },
  es: {
    title: 'Protección de datos',
    subtitle: 'Cumplimiento RGPD',
    intro: 'LEX AI cumple con el',
    gdprName: 'Reglamento General de Protección de Datos (RGPD)',
    introEnd: 'de la Unión Europea.',
    cp1Title: 'Base legal del tratamiento', cp1Desc: 'Tratamiento de datos solo con consentimiento o base legal',
    cp2Title: 'Derecho de acceso', cp2Desc: 'Solicite una copia de sus datos personales',
    cp3Title: 'Derecho de supresión', cp3Desc: 'Eliminación de sus datos previa solicitud',
    cp4Title: 'Portabilidad de datos', cp4Desc: 'Exporte sus datos en formato legible por máquina',
    cp5Title: 'Privacidad por diseño', cp5Desc: 'Privacidad integrada en la arquitectura',
    cp6Title: 'Seguridad de datos', cp6Desc: 'Cifrado y controles de acceso',
    officialDocs: 'Documentos oficiales',
    linkUkText: 'Reglamento (UE) 2016/679 — Ucraniano',
    understood: 'Entendido',
  },
};

export function useGdprT() {
  const locale = getLocale();
  return { t: gdprStrings[locale] };
}
