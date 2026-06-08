/**
 * Centralized i18n for in-app UI strings (outside login/toast).
 * Pattern mirrors toast-i18n.ts — reads locale via getLocale().
 */

import { getLocale, type Locale } from './locales';

type TranslationMap = Record<string, Record<Locale, string>>;

const translations: TranslationMap = {
  // ═══════════════════════════════════════════════════════════
  // Workflows Page
  // ═══════════════════════════════════════════════════════════
  'workflows.title': {
    uk: 'Workflows',
    en: 'Workflows',
    de: 'Workflows',
    es: 'Flujos de trabajo',
  },
  'workflows.subtitle': {
    uk: 'Готові аналітичні шаблони для юриста. Кожен workflow автоматично шукає судові рішення в ЄДРСР, збирає нормативну базу та аналізує правові позиції ВС.',
    en: 'Ready-made analytical templates for lawyers. Each workflow automatically searches court decisions in the registry, collects regulatory framework and analyzes legal positions.',
    de: 'Fertige analytische Vorlagen für Juristen. Jeder Workflow durchsucht automatisch Gerichtsentscheidungen, sammelt die Rechtsgrundlage und analysiert Rechtspositionen.',
    es: 'Plantillas analíticas listas para abogados. Cada flujo de trabajo busca automáticamente resoluciones judiciales en el registro, recopila la base normativa y analiza posiciones legales.',
  },
  'workflows.presetsTitle': {
    uk: 'Готові шаблони аналізу',
    en: 'Ready-made analysis templates',
    de: 'Fertige Analysevorlagen',
    es: 'Plantillas de análisis listas',
  },
  'workflows.searchPlaceholder': {
    uk: 'Пошук шаблонів...',
    en: 'Search templates...',
    de: 'Vorlagen suchen...',
    es: 'Buscar plantillas...',
  },
  'workflows.allCategories': {
    uk: 'Всі',
    en: 'All',
    de: 'Alle',
    es: 'Todos',
  },
  'workflows.noPresetsFound': {
    uk: 'Шаблонів за запитом не знайдено',
    en: 'No templates found for this query',
    de: 'Keine Vorlagen für diese Anfrage gefunden',
    es: 'No se encontraron plantillas para esta consulta',
  },
  'workflows.noWorkflowSets': {
    uk: 'Робочих процесів поки немає',
    en: 'No workflow sets yet',
    de: 'Noch keine Workflow-Sets',
    es: 'Aún no hay flujos de trabajo',
  },
  'workflows.noWorkflowSetsDesc': {
    uk: 'Задайте в чаті запит на глибокий інституційний аналіз (наприклад, \u0022проаналізуй всі рішення суддів Оболонського суду за 15 років\u0022) \u2014 система автоматично створить набір робочих процесів.',
    en: 'Ask a deep institutional analysis question in the chat (e.g., \u0022analyze all decisions of judges of a specific court for 15 years\u0022) \u2014 the system will automatically create a set of workflows.',
    de: 'Stellen Sie im Chat eine tiefgehende institutionelle Analysefrage (z.B. \u0022analysiere alle Entscheidungen der Richter eines bestimmten Gerichts der letzten 15 Jahre\u0022) \u2014 das System erstellt automatisch einen Satz von Workflows.',
    es: 'Haga una consulta de análisis institucional profundo en el chat (ej., \u0022analiza todas las resoluciones de los jueces de un tribunal específico en 15 años\u0022) \u2014 el sistema creará automáticamente un conjunto de flujos de trabajo.',
  },
  'workflows.deleteConfirm': {
    uk: 'Видалити цей набір робочих процесів?',
    en: 'Delete this workflow set?',
    de: 'Dieses Workflow-Set löschen?',
    es: '¿Eliminar este conjunto de flujos de trabajo?',
  },
  'workflows.deleteTooltip': {
    uk: 'Видалити',
    en: 'Delete',
    de: 'Löschen',
    es: 'Eliminar',
  },
  'workflows.processCount': {
    uk: 'процесів',
    en: 'processes',
    de: 'Prozesse',
    es: 'procesos',
  },
  'workflows.completed': {
    uk: 'завершено',
    en: 'completed',
    de: 'abgeschlossen',
    es: 'completados',
  },

  // ═══════════════════════════════════════════════════════════
  // Workflow Statuses (shared between pages)
  // ═══════════════════════════════════════════════════════════
  'status.pending': {
    uk: 'Очікує',
    en: 'Pending',
    de: 'Ausstehend',
    es: 'Pendiente',
  },
  'status.running': {
    uk: 'Виконується',
    en: 'Running',
    de: 'Wird ausgeführt',
    es: 'En ejecución',
  },
  'status.completed': {
    uk: 'Завершено',
    en: 'Completed',
    de: 'Abgeschlossen',
    es: 'Completado',
  },
  'status.partial': {
    uk: 'Частково',
    en: 'Partial',
    de: 'Teilweise',
    es: 'Parcial',
  },
  'status.failed': {
    uk: 'Помилка',
    en: 'Failed',
    de: 'Fehlgeschlagen',
    es: 'Error',
  },
  'status.cancelled': {
    uk: 'Скасовано',
    en: 'Cancelled',
    de: 'Abgebrochen',
    es: 'Cancelado',
  },

  // ═══════════════════════════════════════════════════════════
  // Workflow categories
  // ═══════════════════════════════════════════════════════════
  'category.military': {
    uk: 'Військове право',
    en: 'Military law',
    de: 'Militärrecht',
    es: 'Derecho militar',
  },

  // ═══════════════════════════════════════════════════════════
  // Workflow Set Detail Page
  // ═══════════════════════════════════════════════════════════
  'workflowDetail.backToList': {
    uk: 'Назад до списку',
    en: 'Back to list',
    de: 'Zurück zur Liste',
    es: 'Volver a la lista',
  },
  'workflowDetail.notFound': {
    uk: 'Набір робочих процесів не знайдено.',
    en: 'Workflow set not found.',
    de: 'Workflow-Set nicht gefunden.',
    es: 'Conjunto de flujos de trabajo no encontrado.',
  },
  'workflowDetail.queryLabel': {
    uk: 'Запит',
    en: 'Query',
    de: 'Anfrage',
    es: 'Consulta',
  },
  'workflowDetail.launchFirst': {
    uk: 'Запустити перший',
    en: 'Launch first',
    de: 'Ersten starten',
    es: 'Iniciar primero',
  },
  'workflowDetail.pending': {
    uk: 'очікують',
    en: 'pending',
    de: 'ausstehend',
    es: 'pendientes',
  },

  // ═══════════════════════════════════════════════════════════
  // Workflow Card
  // ═══════════════════════════════════════════════════════════
  'workflowCard.step': {
    uk: 'Крок',
    en: 'Step',
    de: 'Schritt',
    es: 'Paso',
  },
  'workflowCard.cost': {
    uk: 'Вартість',
    en: 'Cost',
    de: 'Kosten',
    es: 'Costo',
  },
  'workflowCard.steps': {
    uk: 'кроків',
    en: 'steps',
    de: 'Schritte',
    es: 'pasos',
  },
  'workflowCard.launch': {
    uk: 'Запустити',
    en: 'Launch',
    de: 'Starten',
    es: 'Iniciar',
  },
  'workflowCard.cancel': {
    uk: 'Скасувати',
    en: 'Cancel',
    de: 'Abbrechen',
    es: 'Cancelar',
  },
  'workflowCard.executionPlan': {
    uk: 'План виконання',
    en: 'Execution plan',
    de: 'Ausführungsplan',
    es: 'Plan de ejecución',
  },
  'workflowCard.results': {
    uk: 'Результати',
    en: 'Results',
    de: 'Ergebnisse',
    es: 'Resultados',
  },
  'workflowCard.errors': {
    uk: 'помилок',
    en: 'errors',
    de: 'Fehler',
    es: 'errores',
  },

  // ═══════════════════════════════════════════════════════════
  // Team Overview
  // ═══════════════════════════════════════════════════════════
  'team.loadError': {
    uk: 'Не вдалося завантажити дані команди',
    en: 'Failed to load team data',
    de: 'Teamdaten konnten nicht geladen werden',
    es: 'No se pudieron cargar los datos del equipo',
  },
  'team.enterEmail': {
    uk: 'Введіть email адресу',
    en: 'Please enter an email address',
    de: 'Bitte geben Sie eine E-Mail-Adresse ein',
    es: 'Introduzca una dirección de correo electrónico',
  },
  'team.inviteSent': {
    uk: 'Запрошення надіслано на',
    en: 'Invitation sent to',
    de: 'Einladung gesendet an',
    es: 'Invitación enviada a',
  },
  'team.removeMemberConfirm': {
    uk: 'Ви впевнені, що хочете видалити цього учасника?',
    en: 'Are you sure you want to remove this member?',
    de: 'Sind Sie sicher, dass Sie dieses Mitglied entfernen möchten?',
    es: '¿Está seguro de que desea eliminar a este miembro?',
  },
  'team.memberRemoved': {
    uk: 'Учасника видалено',
    en: 'Member removed',
    de: 'Mitglied entfernt',
    es: 'Miembro eliminado',
  },
  'team.inviteResent': {
    uk: 'Запрошення надіслано повторно',
    en: 'Invitation resent',
    de: 'Einladung erneut gesendet',
    es: 'Invitación reenviada',
  },
  'team.upgradeTitle': {
    uk: 'Оновити до Business плану',
    en: 'Upgrade to Business Plan',
    de: 'Auf Business-Plan upgraden',
    es: 'Actualizar al Plan Business',
  },
  'team.upgradeDesc': {
    uk: 'Керуйте більшими командами з розширеними функціями',
    en: 'Manage larger teams with advanced collaboration features',
    de: 'Verwalten Sie größere Teams mit erweiterten Funktionen',
    es: 'Gestione equipos más grandes con funciones avanzadas de colaboración',
  },
  'team.upgradeButton': {
    uk: 'Оновити за ₴2,999/міс',
    en: 'Upgrade for ₴2,999/month',
    de: 'Upgrade für ₴2.999/Monat',
    es: 'Actualizar por ₴2.999/mes',
  },
  'team.totalMembers': {
    uk: 'Всього учасників',
    en: 'Total members',
    de: 'Mitglieder gesamt',
    es: 'Total de miembros',
  },
  'team.activeUsers': {
    uk: 'Активні користувачі',
    en: 'Active users',
    de: 'Aktive Benutzer',
    es: 'Usuarios activos',
  },
  'team.last7Days': {
    uk: 'за 7 днів',
    en: 'last 7 days',
    de: 'letzte 7 Tage',
    es: 'últimos 7 días',
  },
  'team.teamRequests': {
    uk: 'Запити команди',
    en: 'Team requests',
    de: 'Team-Anfragen',
    es: 'Solicitudes del equipo',
  },
  'team.teamCost': {
    uk: 'Витрати команди',
    en: 'Team cost',
    de: 'Teamkosten',
    es: 'Costo del equipo',
  },
  'team.thisMonth': {
    uk: 'цього місяця',
    en: 'this month',
    de: 'diesen Monat',
    es: 'este mes',
  },
  'team.membersTitle': {
    uk: 'Учасники команди',
    en: 'Team Members',
    de: 'Teammitglieder',
    es: 'Miembros del equipo',
  },
  'team.inviteMember': {
    uk: 'Запросити учасника',
    en: 'Invite Member',
    de: 'Mitglied einladen',
    es: 'Invitar miembro',
  },
  'team.emailPlaceholder': {
    uk: 'Введіть email адресу',
    en: 'Enter email address',
    de: 'E-Mail-Adresse eingeben',
    es: 'Introduzca la dirección de correo',
  },
  'team.roleUser': {
    uk: 'Користувач',
    en: 'User',
    de: 'Benutzer',
    es: 'Usuario',
  },
  'team.roleAdmin': {
    uk: 'Адміністратор',
    en: 'Admin',
    de: 'Admin',
    es: 'Administrador',
  },
  'team.roleObserver': {
    uk: 'Спостерігач',
    en: 'Observer',
    de: 'Beobachter',
    es: 'Observador',
  },
  'team.sending': {
    uk: 'Надсилання...',
    en: 'Sending...',
    de: 'Senden...',
    es: 'Enviando...',
  },
  'team.sendInvite': {
    uk: 'Надіслати запрошення',
    en: 'Send Invite',
    de: 'Einladung senden',
    es: 'Enviar invitación',
  },
  'team.thUser': {
    uk: 'Користувач',
    en: 'User',
    de: 'Benutzer',
    es: 'Usuario',
  },
  'team.thRole': {
    uk: 'Роль',
    en: 'Role',
    de: 'Rolle',
    es: 'Rol',
  },
  'team.thRequests': {
    uk: 'Запити',
    en: 'Requests',
    de: 'Anfragen',
    es: 'Solicitudes',
  },
  'team.thCost': {
    uk: 'Витрати',
    en: 'Cost',
    de: 'Kosten',
    es: 'Costo',
  },
  'team.thLastActive': {
    uk: 'Остання активність',
    en: 'Last Active',
    de: 'Zuletzt aktiv',
    es: 'Última actividad',
  },
  'team.thStatus': {
    uk: 'Статус',
    en: 'Status',
    de: 'Status',
    es: 'Estado',
  },
  'team.thActions': {
    uk: 'Дії',
    en: 'Actions',
    de: 'Aktionen',
    es: 'Acciones',
  },
  'team.statusActive': {
    uk: 'Активний',
    en: 'Active',
    de: 'Aktiv',
    es: 'Activo',
  },
  'team.statusPending': {
    uk: 'Очікує',
    en: 'Pending',
    de: 'Ausstehend',
    es: 'Pendiente',
  },
  'team.statusInactive': {
    uk: 'Неактивний',
    en: 'Inactive',
    de: 'Inaktiv',
    es: 'Inactivo',
  },
  'team.resendInvite': {
    uk: 'Надіслати повторно',
    en: 'Resend invitation',
    de: 'Einladung erneut senden',
    es: 'Reenviar invitación',
  },
  'team.removeMember': {
    uk: 'Видалити учасника',
    en: 'Remove member',
    de: 'Mitglied entfernen',
    es: 'Eliminar miembro',
  },
  'team.noMembers': {
    uk: 'Учасників команди ще немає. Запросіть когось, щоб почати.',
    en: 'No team members yet. Invite someone to get started.',
    de: 'Noch keine Teammitglieder. Laden Sie jemanden ein.',
    es: 'Aún no hay miembros del equipo. Invite a alguien para comenzar.',
  },
  'team.rolesPermissions': {
    uk: 'Ролі та дозволи',
    en: 'Roles & Permissions',
    de: 'Rollen & Berechtigungen',
    es: 'Roles y permisos',
  },
  'team.thPermission': {
    uk: 'Дозвіл',
    en: 'Permission',
    de: 'Berechtigung',
    es: 'Permiso',
  },
  'team.permApiTools': {
    uk: 'Використання API інструментів',
    en: 'Use API tools',
    de: 'API-Tools verwenden',
    es: 'Uso de herramientas API',
  },
  'team.permViewStats': {
    uk: 'Перегляд статистики використання',
    en: 'View usage statistics',
    de: 'Nutzungsstatistiken ansehen',
    es: 'Ver estadísticas de uso',
  },
  'team.permManageKeys': {
    uk: 'Керування API ключами',
    en: 'Manage API keys',
    de: 'API-Schlüssel verwalten',
    es: 'Gestionar claves API',
  },
  'team.permManageUsers': {
    uk: 'Додавання/видалення користувачів',
    en: 'Add/remove users',
    de: 'Benutzer hinzufügen/entfernen',
    es: 'Agregar/eliminar usuarios',
  },
  'team.permBilling': {
    uk: 'Налаштування білінгу',
    en: 'Billing settings',
    de: 'Abrechnungseinstellungen',
    es: 'Configuración de facturación',
  },
  'team.permChangePlan': {
    uk: 'Зміна тарифного плану',
    en: 'Change pricing plan',
    de: 'Tarifplan ändern',
    es: 'Cambiar plan tarifario',
  },
  'team.permDeleteOrg': {
    uk: 'Видалення організації',
    en: 'Delete organization',
    de: 'Organisation löschen',
    es: 'Eliminar organización',
  },

  // ═══════════════════════════════════════════════════════════
  // Encryption Setup Dialog
  // ═══════════════════════════════════════════════════════════
  'encryption.setupTitle': {
    uk: 'Налаштування шифрування',
    en: 'Encryption setup',
    de: 'Verschlüsselungseinrichtung',
    es: 'Configuración de cifrado',
  },
  'encryption.unlockTitle': {
    uk: 'Розблокувати сейф',
    en: 'Unlock vault',
    de: 'Tresor entsperren',
    es: 'Desbloquear bóveda',
  },
  'encryption.keysCreated': {
    uk: 'Ключі шифрування створено',
    en: 'Encryption keys created',
    de: 'Verschlüsselungsschlüssel erstellt',
    es: 'Claves de cifrado creadas',
  },
  'encryption.downloadWarning': {
    uk: 'Завантажте резервний файл ключа. Без нього та пароля ви не зможете відновити доступ до зашифрованих документів.',
    en: 'Download the backup key file. Without it and your password, you will not be able to recover access to encrypted documents.',
    de: 'Laden Sie die Sicherungsdatei herunter. Ohne diese und Ihr Passwort können Sie nicht auf verschlüsselte Dokumente zugreifen.',
    es: 'Descargue el archivo de clave de respaldo. Sin él y su contraseña, no podrá recuperar el acceso a los documentos cifrados.',
  },
  'encryption.downloadKeyFile': {
    uk: 'Завантажити файл ключа',
    en: 'Download key file',
    de: 'Schlüsseldatei herunterladen',
    es: 'Descargar archivo de clave',
  },
  'encryption.done': {
    uk: 'Готово',
    en: 'Done',
    de: 'Fertig',
    es: 'Listo',
  },
  'encryption.saveKeyNote': {
    uk: 'Збережіть файл у надійному місці. Він потрібен для відновлення доступу.',
    en: 'Save the file in a safe place. It is needed to recover access.',
    de: 'Speichern Sie die Datei an einem sicheren Ort. Sie wird zur Wiederherstellung des Zugangs benötigt.',
    es: 'Guarde el archivo en un lugar seguro. Es necesario para recuperar el acceso.',
  },
  'encryption.setupHint': {
    uk: 'Згенеруйте секретну фразу з 12 слів для захисту ваших документів. Збережіть її у менеджері паролів браузера або запишіть у надійне місце.',
    en: 'Generate a 12-word secret phrase to protect your documents. Save it in your browser password manager or write it down in a safe place.',
    de: 'Generieren Sie eine 12-Wörter-Geheimphrase zum Schutz Ihrer Dokumente. Speichern Sie diese im Passwort-Manager Ihres Browsers oder notieren Sie sie sicher.',
    es: 'Genere una frase secreta de 12 palabras para proteger sus documentos. Guárdela en el gestor de contraseñas de su navegador o anótela en un lugar seguro.',
  },
  'encryption.unlockHint': {
    uk: 'Введіть пароль шифрування для доступу до зашифрованих документів.',
    en: 'Enter your encryption password to access encrypted documents.',
    de: 'Geben Sie Ihr Verschlüsselungspasswort ein, um auf verschlüsselte Dokumente zuzugreifen.',
    es: 'Introduzca su contraseña de cifrado para acceder a los documentos cifrados.',
  },
  'encryption.secretPhraseLabel': {
    uk: 'Секретна фраза (12 слів)',
    en: 'Secret phrase (12 words)',
    de: 'Geheimphrase (12 Wörter)',
    es: 'Frase secreta (12 palabras)',
  },
  'encryption.passwordLabel': {
    uk: 'Пароль',
    en: 'Password',
    de: 'Passwort',
    es: 'Contraseña',
  },
  'encryption.generatePhrase': {
    uk: 'Згенерувати секретну фразу',
    en: 'Generate secret phrase',
    de: 'Geheimphrase generieren',
    es: 'Generar frase secreta',
  },
  'encryption.copied': {
    uk: 'Скопійовано',
    en: 'Copied',
    de: 'Kopiert',
    es: 'Copiado',
  },
  'encryption.copy': {
    uk: 'Копіювати',
    en: 'Copy',
    de: 'Kopieren',
    es: 'Copiar',
  },
  'encryption.setupPlaceholder': {
    uk: 'Натисніть «Згенерувати секретну фразу»',
    en: 'Click "Generate secret phrase"',
    de: 'Klicken Sie auf "Geheimphrase generieren"',
    es: 'Haga clic en "Generar frase secreta"',
  },
  'encryption.unlockPlaceholder': {
    uk: 'Введіть секретну фразу',
    en: 'Enter secret phrase',
    de: 'Geheimphrase eingeben',
    es: 'Introduzca la frase secreta',
  },
  'encryption.confirmLabel': {
    uk: 'Підтвердження пароля',
    en: 'Confirm password',
    de: 'Passwort bestätigen',
    es: 'Confirmar contraseña',
  },
  'encryption.confirmPlaceholder': {
    uk: 'Повторіть пароль',
    en: 'Repeat password',
    de: 'Passwort wiederholen',
    es: 'Repita la contraseña',
  },
  'encryption.passwordsDoNotMatch': {
    uk: 'Паролі не збігаються',
    en: 'Passwords do not match',
    de: 'Passwörter stimmen nicht überein',
    es: 'Las contraseñas no coinciden',
  },
  'encryption.generatingKeys': {
    uk: 'Генерація ключів...',
    en: 'Generating keys...',
    de: 'Schlüssel werden generiert...',
    es: 'Generando claves...',
  },
  'encryption.unlocking': {
    uk: 'Розблокування...',
    en: 'Unlocking...',
    de: 'Entsperren...',
    es: 'Desbloqueando...',
  },
  'encryption.createKeys': {
    uk: 'Створити ключі шифрування',
    en: 'Create encryption keys',
    de: 'Verschlüsselungsschlüssel erstellen',
    es: 'Crear claves de cifrado',
  },
  'encryption.unlock': {
    uk: 'Розблокувати',
    en: 'Unlock',
    de: 'Entsperren',
    es: 'Desbloquear',
  },
  'encryption.browserNote': {
    uk: 'Сервер ніколи не бачить вашу секретну фразу або приватний ключ. Шифрування відбувається у вашому браузері.',
    en: 'The server never sees your secret phrase or private key. Encryption happens in your browser.',
    de: 'Der Server sieht nie Ihre Geheimphrase oder Ihren privaten Schlüssel. Die Verschlüsselung erfolgt in Ihrem Browser.',
    es: 'El servidor nunca ve su frase secreta ni su clave privada. El cifrado se realiza en su navegador.',
  },

  // ═══════════════════════════════════════════════════════════
  // Retroactive Encryption Panel
  // ═══════════════════════════════════════════════════════════
  'retroEncrypt.loadingStats': {
    uk: 'Завантаження статистики...',
    en: 'Loading statistics...',
    de: 'Statistiken werden geladen...',
    es: 'Cargando estadísticas...',
  },
  'retroEncrypt.vaultEncryption': {
    uk: 'Шифрування сейфу',
    en: 'Vault encryption',
    de: 'Tresor-Verschlüsselung',
    es: 'Cifrado de la bóveda',
  },
  'retroEncrypt.encryptedOf': {
    uk: 'з',
    en: 'of',
    de: 'von',
    es: 'de',
  },
  'retroEncrypt.encrypted': {
    uk: 'зашифровано',
    en: 'encrypted',
    de: 'verschlüsselt',
    es: 'cifrados',
  },
  'retroEncrypt.allEncrypted': {
    uk: 'Всі документи зашифровані',
    en: 'All documents are encrypted',
    de: 'Alle Dokumente sind verschlüsselt',
    es: 'Todos los documentos están cifrados',
  },
  'retroEncrypt.encrypting': {
    uk: 'Шифрування',
    en: 'Encrypting',
    de: 'Verschlüsselung',
    es: 'Cifrando',
  },
  'retroEncrypt.errorsCount': {
    uk: 'помилок',
    en: 'errors',
    de: 'Fehler',
    es: 'errores',
  },
  'retroEncrypt.stop': {
    uk: 'Зупинити',
    en: 'Stop',
    de: 'Stoppen',
    es: 'Detener',
  },
  'retroEncrypt.unencryptedDocs': {
    uk: 'документів без шифрування. Зашифруйте їх для максимального захисту. Embeddings та метадані залишаться для пошуку.',
    en: 'unencrypted documents. Encrypt them for maximum protection. Embeddings and metadata remain searchable.',
    de: 'unverschlüsselte Dokumente. Verschlüsseln Sie sie für maximalen Schutz. Embeddings und Metadaten bleiben durchsuchbar.',
    es: 'documentos sin cifrar. Cífrelos para máxima protección. Los embeddings y metadatos permanecen disponibles para búsqueda.',
  },
  'retroEncrypt.setupRequired': {
    uk: 'Спочатку потрібно налаштувати шифрування (створити пароль та ключі).',
    en: 'You need to set up encryption first (create password and keys).',
    de: 'Sie müssen zuerst die Verschlüsselung einrichten (Passwort und Schlüssel erstellen).',
    es: 'Primero debe configurar el cifrado (crear contraseña y claves).',
  },
  'retroEncrypt.encryptVault': {
    uk: 'Зашифрувати мій сейф',
    en: 'Encrypt my vault',
    de: 'Meinen Tresor verschlüsseln',
    es: 'Cifrar mi bóveda',
  },

  // ═══════════════════════════════════════════════════════════
  // Organization Setup Modal
  // ═══════════════════════════════════════════════════════════
  'org.setupTitle': {
    uk: 'Налаштування організації',
    en: 'Organization setup',
    de: 'Organisationseinrichtung',
    es: 'Configuración de la organización',
  },
  'org.setupDesc': {
    uk: 'Створіть організацію для роботи з документами та справами.',
    en: 'Create an organization to work with documents and cases.',
    de: 'Erstellen Sie eine Organisation für die Arbeit mit Dokumenten und Fällen.',
    es: 'Cree una organización para trabajar con documentos y casos.',
  },
  'org.nameLabel': {
    uk: 'Назва компанії',
    en: 'Company name',
    de: 'Firmenname',
    es: 'Nombre de la empresa',
  },
  'org.namePlaceholder': {
    uk: 'ТОВ «Юридична компанія»',
    en: 'Law Firm LLC',
    de: 'Anwaltskanzlei GmbH',
    es: 'Despacho de Abogados S.L.',
  },
  'org.taxIdLabel': {
    uk: 'ЄДРПОУ',
    en: 'Tax ID',
    de: 'Steuernummer',
    es: 'NIF/CIF',
  },
  'org.contactEmail': {
    uk: 'Контактний email',
    en: 'Contact email',
    de: 'Kontakt-E-Mail',
    es: 'Correo de contacto',
  },
  'org.descriptionLabel': {
    uk: 'Опис',
    en: 'Description',
    de: 'Beschreibung',
    es: 'Descripción',
  },
  'org.descriptionPlaceholder': {
    uk: 'Коротко про діяльність компанії',
    en: 'Brief description of the company',
    de: 'Kurze Beschreibung des Unternehmens',
    es: 'Breve descripción de la empresa',
  },
  'org.skip': {
    uk: 'Пропустити',
    en: 'Skip',
    de: 'Überspringen',
    es: 'Omitir',
  },
  'org.saving': {
    uk: 'Збереження...',
    en: 'Saving...',
    de: 'Speichern...',
    es: 'Guardando...',
  },
  'org.save': {
    uk: 'Зберегти',
    en: 'Save',
    de: 'Speichern',
    es: 'Guardar',
  },
  'org.nameRequired': {
    uk: 'Введіть назву організації',
    en: 'Enter organization name',
    de: 'Geben Sie den Organisationsnamen ein',
    es: 'Introduzca el nombre de la organización',
  },
  'org.created': {
    uk: 'Організацію створено',
    en: 'Organization created',
    de: 'Organisation erstellt',
    es: 'Organización creada',
  },

  // ═══════════════════════════════════════════════════════════
  // Main Layout — Page Titles
  // ═══════════════════════════════════════════════════════════
  'page.chat': { uk: 'Чат', en: 'Chat', de: 'Chat', es: 'Chat' },
  'page.profile': { uk: 'Профіль', en: 'Profile', de: 'Profil', es: 'Perfil' },
  'page.billing': { uk: 'Білінг', en: 'Billing', de: 'Abrechnung', es: 'Facturación' },
  'page.myContracts': { uk: 'Мої договори', en: 'My Contracts', de: 'Meine Verträge', es: 'Mis contratos' },
  'page.judges': { uk: 'Судді', en: 'Judges', de: 'Richter', es: 'Jueces' },
  'page.lawyers': { uk: 'Адвокати', en: 'Lawyers', de: 'Anwälte', es: 'Abogados' },
  'page.clients': { uk: 'Клієнти', en: 'Clients', de: 'Mandanten', es: 'Clientes' },
  'page.documents': { uk: 'Документи', en: 'Documents', de: 'Dokumente', es: 'Documentos' },
  'page.matters': { uk: 'Справи (юридичні)', en: 'Matters (legal)', de: 'Rechtssachen', es: 'Asuntos (legales)' },
  'page.news': { uk: 'Новини КМУ', en: 'CMU News', de: 'CMU-Nachrichten', es: 'Noticias del CMU' },
  'page.history': { uk: 'Історія запитів', en: 'Query History', de: 'Anfragenverlauf', es: 'Historial de consultas' },
  'page.decisionsSearch': { uk: 'Пошук судових рішень', en: 'Court Decision Search', de: 'Gerichtsentscheidungssuche', es: 'Búsqueda de resoluciones judiciales' },
  'page.caseAnalysis': { uk: 'Аналіз справи', en: 'Case Analysis', de: 'Fallanalyse', es: 'Análisis de caso' },
  'page.legislationMonitoring': { uk: 'База законодавства', en: 'Legislation Database', de: 'Gesetzgebungsdatenbank', es: 'Base de legislación' },
  'page.courtPractice': { uk: 'Аналіз судової практики', en: 'Court Practice Analysis', de: 'Rechtsprechungsanalyse', es: 'Análisis de práctica judicial' },
  'page.legalCodes': { uk: 'Кодекси та закони', en: 'Codes & Laws', de: 'Gesetzbücher & Gesetze', es: 'Códigos y leyes' },
  'page.clientMessaging': { uk: 'Відправити повідомлення', en: 'Send Message', de: 'Nachricht senden', es: 'Enviar mensaje' },
  'page.timeEntries': { uk: 'Облік часу', en: 'Time Entries', de: 'Zeiterfassung', es: 'Registro de horas' },
  'page.invoices': { uk: 'Рахунки', en: 'Invoices', de: 'Rechnungen', es: 'Facturas' },
  'page.calendar': { uk: 'Календар', en: 'Calendar', de: 'Kalender', es: 'Calendario' },
  'page.adminOverview': { uk: 'Огляд системи', en: 'System Overview', de: 'Systemübersicht', es: 'Vista general del sistema' },
  'page.adminMonitoring': { uk: 'Моніторинг джерел даних', en: 'Data Sources Monitoring', de: 'Datenquellen-Monitoring', es: 'Monitoreo de fuentes de datos' },
  'page.adminUsers': { uk: 'Керування користувачами', en: 'User Management', de: 'Benutzerverwaltung', es: 'Gestión de usuarios' },
  'page.adminCosts': { uk: 'Витрати API', en: 'API Costs & Analytics', de: 'API-Kosten & Analytik', es: 'Costos y analítica de API' },
  'page.adminDataSources': { uk: 'Джерела даних', en: 'Data Sources', de: 'Datenquellen', es: 'Fuentes de datos' },
  'page.adminBilling': { uk: 'Керування білінгом', en: 'Billing Management', de: 'Abrechnungsverwaltung', es: 'Gestión de facturación' },
  'page.adminInfra': { uk: 'Інфраструктура', en: 'Infrastructure', de: 'Infrastruktur', es: 'Infraestructura' },
  'page.adminContainers': { uk: 'Контейнери', en: 'Containers', de: 'Container', es: 'Contenedores' },
  'page.adminConfig': { uk: 'Конфігурація системи', en: 'System Configuration', de: 'Systemkonfiguration', es: 'Configuración del sistema' },
  'page.adminTerminal': { uk: 'Термінал адміністратора', en: 'Admin Terminal', de: 'Admin-Terminal', es: 'Terminal de administración' },
  'page.adminBulkScrape': { uk: 'Пайплайн збору даних', en: 'Data Collection Pipeline', de: 'Datenerfassungspipeline', es: 'Pipeline de recolección de datos' },
  'page.adminOpenData': { uk: 'Каталог OpenData', en: 'OpenData Catalog', de: 'OpenData-Katalog', es: 'Catálogo OpenData' },
  'page.adminPg': { uk: 'PG Моніторинг', en: 'PG Monitoring', de: 'PG-Monitoring', es: 'Monitoreo PG' },
  'page.adminLimits': { uk: 'Ліміти системи', en: 'System Limits', de: 'Systemlimits', es: 'Límites del sistema' },
  'page.attorneyClients': { uk: 'Мої клієнти', en: 'My Clients', de: 'Meine Mandanten', es: 'Mis clientes' },
  'page.judgeDetail': { uk: 'Деталі судді', en: 'Judge Details', de: 'Richterdetails', es: 'Detalles del juez' },
  'page.lawyerDetail': { uk: 'Деталі адвоката', en: 'Lawyer Details', de: 'Anwaltsdetails', es: 'Detalles del abogado' },
  'page.clientDetail': { uk: 'Деталі клієнта', en: 'Client Details', de: 'Mandantendetails', es: 'Detalles del cliente' },
  'page.matterDetail': { uk: 'Деталі справи', en: 'Matter Details', de: 'Falldetails', es: 'Detalles del asunto' },
  'page.documentsFolder': { uk: 'Документи', en: 'Documents', de: 'Dokumente', es: 'Documentos' },

  // ═══════════════════════════════════════════════════════════
  // Layout tooltips
  // ═══════════════════════════════════════════════════════════
  'layout.hideMenu': { uk: 'Сховати меню', en: 'Hide menu', de: 'Menü ausblenden', es: 'Ocultar menú' },
  'layout.showMenu': { uk: 'Показати меню', en: 'Show menu', de: 'Menü anzeigen', es: 'Mostrar menú' },
  'layout.hidePanel': { uk: 'Сховати панель', en: 'Hide panel', de: 'Panel ausblenden', es: 'Ocultar panel' },
  'layout.showPanel': { uk: 'Показати панель', en: 'Show panel', de: 'Panel anzeigen', es: 'Mostrar panel' },

  // ═══════════════════════════════════════════════════════════
  // Sidebar Navigation
  // ═══════════════════════════════════════════════════════════
  'nav.newQuery': { uk: 'Новий запит', en: 'New query', de: 'Neue Anfrage', es: 'Nueva consulta' },
  'nav.expandAll': { uk: 'Розгорнути все', en: 'Expand all', de: 'Alle aufklappen', es: 'Expandir todo' },
  'nav.collapseAll': { uk: 'Згорнути все', en: 'Collapse all', de: 'Alle zuklappen', es: 'Contraer todo' },

  // Section titles
  'nav.section.conversations': { uk: 'Розмови', en: 'Conversations', de: 'Gespräche', es: 'Conversaciones' },
  'nav.section.research': { uk: 'Дослідження', en: 'Research', de: 'Forschung', es: 'Investigación' },
  'nav.section.legislation': { uk: 'Законодавство', en: 'Legislation', de: 'Gesetzgebung', es: 'Legislación' },
  'nav.section.vault': { uk: 'Vault', en: 'Vault', de: 'Tresor', es: 'Bóveda' },
  'nav.section.matters': { uk: 'Справи', en: 'Matters', de: 'Fälle', es: 'Asuntos' },
  'nav.section.consultations': { uk: 'Консультації', en: 'Consultations', de: 'Beratungen', es: 'Consultas' },
  'nav.section.attorneys': { uk: 'Адвокати', en: 'Attorneys', de: 'Anwälte', es: 'Abogados' },
  'nav.section.developer': { uk: 'Розробникам', en: 'Developers', de: 'Entwickler', es: 'Desarrolladores' },
  'nav.section.externalSources': { uk: 'Зовнішні джерела', en: 'External Sources', de: 'Externe Quellen', es: 'Fuentes externas' },
  'nav.section.monitoring': { uk: 'Моніторинг', en: 'Monitoring', de: 'Überwachung', es: 'Monitoreo' },

  // Research items
  'nav.decisions': { uk: 'Судові рішення', en: 'Court Decisions', de: 'Gerichtsentscheidungen', es: 'Resoluciones judiciales' },
  'nav.regulations': { uk: 'Нормативні акти', en: 'Regulatory Acts', de: 'Rechtsvorschriften', es: 'Actos normativos' },
  'nav.commentary': { uk: 'Коментарі та практика', en: 'Commentary & Practice', de: 'Kommentare & Praxis', es: 'Comentarios y práctica' },
  'nav.verification': { uk: 'Перевірка актуальності', en: 'Relevance Check', de: 'Aktualitätsprüfung', es: 'Verificación de vigencia' },
  'nav.judges': { uk: 'Судді', en: 'Judges', de: 'Richter', es: 'Jueces' },
  'nav.lawyers': { uk: 'Адвокати', en: 'Lawyers', de: 'Anwälte', es: 'Abogados' },

  // Legislation items
  'nav.legislationDb': { uk: 'База законодавства', en: 'Legislation Database', de: 'Gesetzesdatenbank', es: 'Base de legislación' },
  'nav.codes': { uk: 'Кодекси та закони', en: 'Codes & Laws', de: 'Gesetzbücher & Gesetze', es: 'Códigos y leyes' },
  'nav.newsKmu': { uk: 'Новини КМУ', en: 'CMU News', de: 'KMU-Nachrichten', es: 'Noticias del Gobierno' },
  'nav.newsLex': { uk: 'Новини LEX', en: 'LEX News', de: 'LEX-Nachrichten', es: 'Noticias LEX' },

  // Vault
  'nav.allDocuments': { uk: 'Всі документи', en: 'All Documents', de: 'Alle Dokumente', es: 'Todos los documentos' },

  // Matters
  'nav.matters': { uk: 'Справи', en: 'Matters', de: 'Fälle', es: 'Asuntos' },
  'nav.timeEntries': { uk: 'Time Entries', en: 'Time Entries', de: 'Zeiteinträge', es: 'Registros de tiempo' },
  'nav.invoices': { uk: 'Invoices', en: 'Invoices', de: 'Rechnungen', es: 'Facturas' },
  'nav.caseAnalysis': { uk: 'Аналіз справ', en: 'Case Analysis', de: 'Fallanalyse', es: 'Análisis de casos' },

  // Attorneys
  'nav.findAttorney': { uk: 'Знайти адвоката', en: 'Find a Lawyer', de: 'Anwalt finden', es: 'Buscar abogado' },
  'nav.myConsultations': { uk: 'Мої консультації', en: 'My Consultations', de: 'Meine Beratungen', es: 'Mis consultas' },
  'nav.myClients': { uk: 'Мої клієнти', en: 'My Clients', de: 'Meine Mandanten', es: 'Mis clientes' },

  // Developer
  'nav.apiDocs': { uk: 'API документація', en: 'API Documentation', de: 'API-Dokumentation', es: 'Documentación API' },

  // External sources (admin)
  'nav.extMonitoring': { uk: 'Інструменти', en: 'Tool Usage', de: 'Werkzeuge', es: 'Herramientas' },
  'nav.extDataSources': { uk: 'Джерела даних', en: 'Data Sources', de: 'Datenquellen', es: 'Fuentes de datos' },
  'nav.extOpenData': { uk: 'Каталог OpenData', en: 'OpenData Catalog', de: 'OpenData-Katalog', es: 'Catálogo OpenData' },

  // Monitoring (admin)
  'nav.systemOverview': { uk: 'Огляд системи', en: 'System Overview', de: 'Systemübersicht', es: 'Resumen del sistema' },
  'nav.users': { uk: 'Користувачі', en: 'Users', de: 'Benutzer', es: 'Usuarios' },
  'nav.apiCosts': { uk: 'Витрати API', en: 'API Costs', de: 'API-Kosten', es: 'Costos API' },
  'nav.infrastructure': { uk: 'Інфраструктура', en: 'Infrastructure', de: 'Infrastruktur', es: 'Infraestructura' },
  'nav.containers': { uk: 'Контейнери', en: 'Containers', de: 'Container', es: 'Contenedores' },
  'nav.billing': { uk: 'Біллінг', en: 'Billing', de: 'Abrechnung', es: 'Facturación' },
  'nav.config': { uk: 'Конфігурація', en: 'Configuration', de: 'Konfiguration', es: 'Configuración' },
  'nav.servicePricing': { uk: 'Собівартість сервісів', en: 'Service Pricing', de: 'Servicepreise', es: 'Precios de servicios' },
  'nav.terminal': { uk: 'Термінал', en: 'Terminal', de: 'Terminal', es: 'Terminal' },
  'nav.zoStats': { uk: 'Статистика рішень', en: 'Decision Statistics', de: 'Entscheidungsstatistik', es: 'Estadísticas de resoluciones' },
  'nav.userActivity': { uk: 'Активність юзерів', en: 'User Activity', de: 'Benutzeraktivität', es: 'Actividad de usuarios' },
  'nav.bulkScrape': { uk: 'Пайплайн збору', en: 'Collection Pipeline', de: 'Sammlungspipeline', es: 'Pipeline de recopilación' },
  'nav.pgMonitoring': { uk: 'PG Моніторинг', en: 'PG Monitoring', de: 'PG-Überwachung', es: 'Monitoreo PG' },
  'nav.limits': { uk: 'Ліміти системи', en: 'System Limits', de: 'Systemlimits', es: 'Límites del sistema' },

  // Sidebar footer / profile menu
  'nav.offer': { uk: 'Оферта', en: 'Terms of Service', de: 'Nutzungsbedingungen', es: 'Términos de servicio' },
  'nav.privacy': { uk: 'Конфіденційність', en: 'Privacy', de: 'Datenschutz', es: 'Privacidad' },
  'nav.abuseReport': { uk: 'Порушення', en: 'Report Abuse', de: 'Missbrauch melden', es: 'Reportar abuso' },
  'nav.profile': { uk: 'Профіль', en: 'Profile', de: 'Profil', es: 'Perfil' },
  'nav.profileBilling': { uk: 'Біллінг', en: 'Billing', de: 'Abrechnung', es: 'Facturación' },
  'nav.myContracts': { uk: 'Мої договори', en: 'My Contracts', de: 'Meine Verträge', es: 'Mis contratos' },
  'nav.devOffer': { uk: 'Оферта розробника', en: 'Developer Terms', de: 'Entwicklerbedingungen', es: 'Términos para desarrolladores' },
  'nav.inviteFriend': { uk: 'Запросити друга', en: 'Invite a Friend', de: 'Freund einladen', es: 'Invitar a un amigo' },
  'nav.mcpConnect': { uk: 'MCP конект', en: 'MCP Connect', de: 'MCP Connect', es: 'MCP Connect' },
  'nav.team': { uk: 'Команда', en: 'Team', de: 'Team', es: 'Equipo' },
  'nav.logout': { uk: 'Вихід', en: 'Log out', de: 'Abmelden', es: 'Cerrar sesión' },
  'nav.defaultUser': { uk: 'Користувач', en: 'User', de: 'Benutzer', es: 'Usuario' },

  // ═══════════════════════════════════════════════════════════
  // Billing — B2B Invoice statuses
  // ═══════════════════════════════════════════════════════════
  'billing.invoice.status.all': {
    uk: 'Усі статуси',
    en: 'All statuses',
    de: 'Alle Status',
    es: 'Todos los estados',
  },
  'billing.invoice.status.draft': {
    uk: 'Чернетка',
    en: 'Draft',
    de: 'Entwurf',
    es: 'Borrador',
  },
  'billing.invoice.status.issued': {
    uk: 'Виставлено',
    en: 'Issued',
    de: 'Ausgestellt',
    es: 'Emitida',
  },
  'billing.invoice.status.sent': {
    uk: 'Надіслано',
    en: 'Sent',
    de: 'Versendet',
    es: 'Enviada',
  },
  'billing.invoice.status.paid': {
    uk: 'Оплачено',
    en: 'Paid',
    de: 'Bezahlt',
    es: 'Pagada',
  },
  'billing.invoice.status.cancelled': {
    uk: 'Скасовано',
    en: 'Cancelled',
    de: 'Storniert',
    es: 'Cancelada',
  },
  'billing.invoice.status.overdue': {
    uk: 'Прострочено',
    en: 'Overdue',
    de: 'Überfällig',
    es: 'Vencida',
  },
  'billing.invoice.status.void': {
    uk: 'Анульовано',
    en: 'Void',
    de: 'Annulliert',
    es: 'Anulada',
  },

  // ═══════════════════════════════════════════════════════════
  // Billing — B2B Invoices tab UI
  // ═══════════════════════════════════════════════════════════
  'billing.invoices.title': { uk: 'Рахунки B2B', en: 'B2B Invoices', de: 'B2B-Rechnungen', es: 'Facturas B2B' },
  'billing.invoices.subtitle': { uk: 'Рахунки на оплату для безготівкового розрахунку', en: 'Invoices for bank transfer payment', de: 'Rechnungen für bargeldlose Zahlung', es: 'Facturas para pago por transferencia bancaria' },
  'billing.invoices.refresh': { uk: 'Оновити', en: 'Refresh', de: 'Aktualisieren', es: 'Actualizar' },
  'billing.invoices.request': { uk: 'Запросити рахунок', en: 'Request invoice', de: 'Rechnung anfordern', es: 'Solicitar factura' },
  'billing.invoices.filter.all': { uk: 'Всі', en: 'All', de: 'Alle', es: 'Todas' },
  'billing.invoices.filter.issued': { uk: 'Виставлені', en: 'Issued', de: 'Ausgestellt', es: 'Emitidas' },
  'billing.invoices.filter.paid': { uk: 'Оплачені', en: 'Paid', de: 'Bezahlt', es: 'Pagadas' },
  'billing.invoices.filter.cancelled': { uk: 'Скасовані', en: 'Cancelled', de: 'Storniert', es: 'Canceladas' },
  'billing.invoices.loading': { uk: 'Завантаження...', en: 'Loading...', de: 'Laden...', es: 'Cargando...' },
  'billing.invoices.empty': { uk: 'Рахунків ще немає', en: 'No invoices yet', de: 'Noch keine Rechnungen', es: 'Aún no hay facturas' },
  'billing.invoices.emptyHint': { uk: 'Натисніть «Запросити рахунок» для створення', en: 'Click "Request invoice" to create one', de: 'Klicken Sie auf „Rechnung anfordern", um eine zu erstellen', es: 'Haga clic en «Solicitar factura» para crear una' },
  'billing.invoices.col.number': { uk: 'Номер', en: 'Number', de: 'Nummer', es: 'Número' },
  'billing.invoices.col.date': { uk: 'Дата', en: 'Date', de: 'Datum', es: 'Fecha' },
  'billing.invoices.col.type': { uk: 'Тип', en: 'Type', de: 'Typ', es: 'Tipo' },
  'billing.invoices.col.amount': { uk: 'Сума, грн', en: 'Amount, UAH', de: 'Betrag, UAH', es: 'Importe, UAH' },
  'billing.invoices.col.status': { uk: 'Статус', en: 'Status', de: 'Status', es: 'Estado' },
  'billing.invoices.col.actions': { uk: 'Дії', en: 'Actions', de: 'Aktionen', es: 'Acciones' },
  'billing.invoices.type.subscription': { uk: 'Підписка', en: 'Subscription', de: 'Abonnement', es: 'Suscripción' },
  'billing.invoices.type.topup': { uk: 'Поповнення', en: 'Top-up', de: 'Aufladung', es: 'Recarga' },
  'billing.invoices.total': { uk: 'Всього рахунків', en: 'Total invoices', de: 'Rechnungen gesamt', es: 'Total de facturas' },
  'billing.invoices.action.preview': { uk: 'Переглянути', en: 'Preview', de: 'Vorschau', es: 'Vista previa' },
  'billing.invoices.action.download': { uk: 'Завантажити PDF', en: 'Download PDF', de: 'PDF herunterladen', es: 'Descargar PDF' },
  'billing.invoices.action.cancel': { uk: 'Скасувати', en: 'Cancel', de: 'Stornieren', es: 'Cancelar' },
  'billing.invoices.action.cancelConfirm': { uk: 'Скасувати рахунок', en: 'Cancel invoice', de: 'Rechnung stornieren', es: 'Cancelar factura' },
  'billing.invoices.error.downloadPdf': { uk: 'Помилка завантаження PDF', en: 'PDF download error', de: 'Fehler beim Herunterladen der PDF', es: 'Error al descargar PDF' },
  'billing.invoices.error.cancel': { uk: 'Помилка скасування рахунку', en: 'Invoice cancellation error', de: 'Fehler beim Stornieren der Rechnung', es: 'Error al cancelar la factura' },
  'billing.invoices.preview.title': { uk: 'Рахунок', en: 'Invoice', de: 'Rechnung', es: 'Factura' },
  'billing.invoices.preview.download': { uk: 'Завантажити', en: 'Download', de: 'Herunterladen', es: 'Descargar' },
  'billing.invoices.preview.loading': { uk: 'Завантаження PDF...', en: 'Loading PDF...', de: 'PDF wird geladen...', es: 'Cargando PDF...' },

  // ═══════════════════════════════════════════════════════════
  // Time Entry Statuses
  // ═══════════════════════════════════════════════════════════
  'timeEntry.status.all': {
    uk: 'Всі статуси',
    en: 'All statuses',
    de: 'Alle Status',
    es: 'Todos los estados',
  },
  'timeEntry.status.draft': {
    uk: 'Чернетка',
    en: 'Draft',
    de: 'Entwurf',
    es: 'Borrador',
  },
  'timeEntry.status.submitted': {
    uk: 'Надіслано',
    en: 'Submitted',
    de: 'Eingereicht',
    es: 'Enviado',
  },
  'timeEntry.status.approved': {
    uk: 'Затверджено',
    en: 'Approved',
    de: 'Genehmigt',
    es: 'Aprobado',
  },
  'timeEntry.status.invoiced': {
    uk: 'Рахунок',
    en: 'Invoiced',
    de: 'In Rechnung gestellt',
    es: 'Facturado',
  },
  'timeEntry.status.rejected': {
    uk: 'Відхилено',
    en: 'Rejected',
    de: 'Abgelehnt',
    es: 'Rechazado',
  },

  // Folder delete modal
  'nav.deleteFolder': { uk: 'Видалити папку?', en: 'Delete folder?', de: 'Ordner löschen?', es: '¿Eliminar carpeta?' },
  'nav.deleteFolderDesc': { uk: 'будуть видалені. Цю дію можна скасувати через відновлення документів.', en: 'will be deleted. This can be undone via document recovery.', de: 'werden gelöscht. Dies kann über die Dokumentwiederherstellung rückgängig gemacht werden.', es: 'serán eliminados. Esto se puede deshacer a través de la recuperación de documentos.' },
  'nav.deleteFolderPrefix': { uk: 'Всі документи в папці', en: 'All documents in folder', de: 'Alle Dokumente im Ordner', es: 'Todos los documentos en la carpeta' },
  'nav.cancel': { uk: 'Скасувати', en: 'Cancel', de: 'Abbrechen', es: 'Cancelar' },
  'nav.delete': { uk: 'Видалити', en: 'Delete', de: 'Löschen', es: 'Eliminar' },
};

/**
 * Get translated string by key. Falls back to Ukrainian.
 */
export function appT(key: string): string {
  const entry = translations[key];
  if (!entry) return key;
  const locale = getLocale();
  return entry[locale] || entry.uk;
}

/**
 * React hook for app translations — reads locale once per render.
 */
export function useAppT() {
  const locale = getLocale();
  const t = (key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[locale] || entry.uk;
  };
  return { t, locale };
}
