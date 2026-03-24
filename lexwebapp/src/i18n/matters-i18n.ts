/**
 * Centralized i18n for Matters, Consultations, and Attorney components.
 * Pattern: call useMattersT() in components to get translated strings.
 */

import { getLocale, type Locale } from './locales';

type TranslationMap = Record<string, Record<Locale, string>>;

const translations: TranslationMap = {
  // ─── MattersPage ───
  mattersTitle: {
    uk: 'Справи',
    en: 'Matters',
    de: 'Angelegenheiten',
    es: 'Asuntos',
  },
  mattersSubtitle: {
    uk: 'Управління юридичними справами та провадженнями. Кожна справа містить документи, команду, історію дій та заборони знищення.',
    en: 'Manage legal matters and proceedings. Each matter contains documents, team, activity history and legal holds.',
    de: 'Verwaltung von Rechtsangelegenheiten und Verfahren. Jede Angelegenheit enthalt Dokumente, Team, Aktivitatsverlauf und Aufbewahrungspflichten.',
    es: 'Gestione asuntos legales y procedimientos. Cada asunto contiene documentos, equipo, historial de actividad y retenciones legales.',
  },
  createMatter: {
    uk: 'Створити справу',
    en: 'Create Matter',
    de: 'Angelegenheit erstellen',
    es: 'Crear asunto',
  },
  totalLabel: {
    uk: 'Всього:',
    en: 'Total:',
    de: 'Gesamt:',
    es: 'Total:',
  },
  searchMattersPlaceholder: {
    uk: 'Пошук за назвою справи...',
    en: 'Search by matter name...',
    de: 'Suche nach Angelegenheitsname...',
    es: 'Buscar por nombre del asunto...',
  },
  filterAll: {
    uk: 'Всі',
    en: 'All',
    de: 'Alle',
    es: 'Todos',
  },
  filterOpen: {
    uk: 'Відкриті',
    en: 'Open',
    de: 'Offen',
    es: 'Abiertos',
  },
  filterActive: {
    uk: 'Активні',
    en: 'Active',
    de: 'Aktiv',
    es: 'Activos',
  },
  filterClosed: {
    uk: 'Закриті',
    en: 'Closed',
    de: 'Geschlossen',
    es: 'Cerrados',
  },
  filterArchived: {
    uk: 'Архів',
    en: 'Archived',
    de: 'Archiviert',
    es: 'Archivados',
  },
  allClients: {
    uk: 'Всі клієнти',
    en: 'All clients',
    de: 'Alle Mandanten',
    es: 'Todos los clientes',
  },
  failedToLoadMatters: {
    uk: 'Не вдалося завантажити справи',
    en: 'Failed to load matters',
    de: 'Angelegenheiten konnten nicht geladen werden',
    es: 'No se pudieron cargar los asuntos',
  },
  tryAgain: {
    uk: 'Спробувати знову',
    en: 'Try again',
    de: 'Erneut versuchen',
    es: 'Intentar de nuevo',
  },
  legalHold: {
    uk: 'Заборона знищення',
    en: 'Legal Hold',
    de: 'Aufbewahrungspflicht',
    es: 'Retenci\u00f3n legal',
  },
  openMatter: {
    uk: 'Відкрити справу',
    en: 'Open matter',
    de: 'Angelegenheit offnen',
    es: 'Abrir asunto',
  },
  noMattersFound: {
    uk: 'Справ не знайдено',
    en: 'No matters found',
    de: 'Keine Angelegenheiten gefunden',
    es: 'No se encontraron asuntos',
  },
  createFirstMatter: {
    uk: 'Створіть першу справу для початку роботи',
    en: 'Create your first matter to get started',
    de: 'Erstellen Sie Ihre erste Angelegenheit, um zu beginnen',
    es: 'Cree su primer asunto para comenzar',
  },
  adjustFilters: {
    uk: 'Спробуйте змінити параметри пошуку або фільтри',
    en: 'Try adjusting your search or filters',
    de: 'Versuchen Sie, Ihre Suche oder Filter anzupassen',
    es: 'Intente ajustar su b\u00fasqueda o filtros',
  },
  prevPage: {
    uk: 'Назад',
    en: 'Previous',
    de: 'Zuruck',
    es: 'Anterior',
  },
  nextPage: {
    uk: 'Далі',
    en: 'Next',
    de: 'Weiter',
    es: 'Siguiente',
  },
  paginationOf: {
    uk: 'з',
    en: 'of',
    de: 'von',
    es: 'de',
  },

  // ─── Status labels ───
  statusOpen: {
    uk: 'Відкрита',
    en: 'Open',
    de: 'Offen',
    es: 'Abierto',
  },
  statusActive: {
    uk: 'Активна',
    en: 'Active',
    de: 'Aktiv',
    es: 'Activo',
  },
  statusClosed: {
    uk: 'Закрита',
    en: 'Closed',
    de: 'Geschlossen',
    es: 'Cerrado',
  },
  statusArchived: {
    uk: 'Архів',
    en: 'Archived',
    de: 'Archiviert',
    es: 'Archivado',
  },

  // ─── MatterDetailPage ───
  backToMatters: {
    uk: 'Назад до списку справ',
    en: 'Back to matters list',
    de: 'Zuruck zur Ubersicht',
    es: 'Volver a la lista de asuntos',
  },
  matterNotFound: {
    uk: 'Справу не знайдено',
    en: 'Matter not found',
    de: 'Angelegenheit nicht gefunden',
    es: 'Asunto no encontrado',
  },
  returnToList: {
    uk: 'Повернутися до списку',
    en: 'Return to list',
    de: 'Zuruck zur Liste',
    es: 'Volver a la lista',
  },
  closeMatter: {
    uk: 'Закрити справу',
    en: 'Close matter',
    de: 'Angelegenheit schliessen',
    es: 'Cerrar asunto',
  },
  closeConfirm: {
    uk: 'Ви впевнені, що хочете закрити цю справу?',
    en: 'Are you sure you want to close this matter?',
    de: 'Sind Sie sicher, dass Sie diese Angelegenheit schliessen mochten?',
    es: '\u00bfEst\u00e1 seguro de que desea cerrar este asunto?',
  },
  tabOverview: {
    uk: 'Огляд',
    en: 'Overview',
    de: 'Ubersicht',
    es: 'Resumen',
  },
  tabTeam: {
    uk: 'Команда',
    en: 'Team',
    de: 'Team',
    es: 'Equipo',
  },
  tabHolds: {
    uk: 'Заборона знищення',
    en: 'Legal Holds',
    de: 'Aufbewahrungspflichten',
    es: 'Retenciones legales',
  },
  tabDocuments: {
    uk: 'Документи',
    en: 'Documents',
    de: 'Dokumente',
    es: 'Documentos',
  },
  tabActivity: {
    uk: 'Активність',
    en: 'Activity',
    de: 'Aktivitat',
    es: 'Actividad',
  },
  matterDetails: {
    uk: 'Деталі справи',
    en: 'Matter Details',
    de: 'Angelegenheitsdetails',
    es: 'Detalles del asunto',
  },
  typeLabel: {
    uk: 'Тип',
    en: 'Type',
    de: 'Typ',
    es: 'Tipo',
  },
  typeDescription: {
    uk: 'Категорія юридичної роботи за цією справою',
    en: 'Category of legal work for this matter',
    de: 'Kategorie der Rechtsarbeit fur diese Angelegenheit',
    es: 'Categor\u00eda de trabajo legal para este asunto',
  },
  responsibleLabel: {
    uk: 'Відповідальний',
    en: 'Responsible',
    de: 'Verantwortlich',
    es: 'Responsable',
  },
  responsibleDescription: {
    uk: 'Адвокат, який веде справу',
    en: 'Attorney handling the matter',
    de: 'Anwalt, der die Angelegenheit fuhrt',
    es: 'Abogado a cargo del asunto',
  },
  openDate: {
    uk: 'Дата відкриття',
    en: 'Open Date',
    de: 'Eroffnungsdatum',
    es: 'Fecha de apertura',
  },
  openDateDescription: {
    uk: 'Коли справу було створено в системі',
    en: 'When the matter was created in the system',
    de: 'Wann die Angelegenheit im System erstellt wurde',
    es: 'Cu\u00e1ndo se cre\u00f3 el asunto en el sistema',
  },
  closeDate: {
    uk: 'Дата закриття',
    en: 'Close Date',
    de: 'Abschlussdatum',
    es: 'Fecha de cierre',
  },
  closeDateDescription: {
    uk: 'Коли справу було завершено',
    en: 'When the matter was completed',
    de: 'Wann die Angelegenheit abgeschlossen wurde',
    es: 'Cu\u00e1ndo se complet\u00f3 el asunto',
  },
  retentionPeriod: {
    uk: 'Строк зберігання',
    en: 'Retention Period',
    de: 'Aufbewahrungsfrist',
    es: 'Per\u00edodo de retenci\u00f3n',
  },
  retentionDescription: {
    uk: 'Мінімальний період зберігання документів після закриття',
    en: 'Minimum document retention period after closing',
    de: 'Mindestaufbewahrungsfrist fur Dokumente nach Abschluss',
    es: 'Per\u00edodo m\u00ednimo de retenci\u00f3n de documentos despu\u00e9s del cierre',
  },
  yearsShort: {
    uk: 'р.',
    en: 'yr.',
    de: 'J.',
    es: 'a\u00f1os',
  },
  courtAndParties: {
    uk: 'Суд та сторони',
    en: 'Court & Parties',
    de: 'Gericht & Parteien',
    es: 'Tribunal y partes',
  },
  courtLabel: {
    uk: 'Суд',
    en: 'Court',
    de: 'Gericht',
    es: 'Tribunal',
  },
  courtDescription: {
    uk: 'Суд, в якому розглядається справа',
    en: 'Court where the matter is being heard',
    de: 'Gericht, in dem die Angelegenheit verhandelt wird',
    es: 'Tribunal donde se tramita el asunto',
  },
  courtCaseNumber: {
    uk: 'Номер справи в суді',
    en: 'Court Case Number',
    de: 'Gerichtsaktenzeichen',
    es: 'N\u00famero de expediente judicial',
  },
  courtCaseNumberDescription: {
    uk: 'Єдиний унікальний номер судової справи',
    en: 'Unique court case number',
    de: 'Einzigartige Gerichtsaktenzeichen',
    es: 'N\u00famero \u00fanico del expediente judicial',
  },
  opposingParty: {
    uk: 'Протилежна сторона',
    en: 'Opposing Party',
    de: 'Gegenpartei',
    es: 'Parte contraria',
  },
  opposingPartyDescription: {
    uk: 'Опонент у справі (відповідач, позивач тощо)',
    en: 'Opponent in the case (defendant, plaintiff, etc.)',
    de: 'Gegner im Fall (Beklagter, Klager usw.)',
    es: 'Oponente en el caso (demandado, demandante, etc.)',
  },
  relatedParties: {
    uk: "Пов'язані сторони",
    en: 'Related Parties',
    de: 'Verbundene Parteien',
    es: 'Partes relacionadas',
  },
  relatedPartiesDescription: {
    uk: 'Треті особи, свідки або інші учасники справи',
    en: 'Third parties, witnesses, or other case participants',
    de: 'Dritte, Zeugen oder andere Verfahrensbeteiligte',
    es: 'Terceros, testigos u otros participantes del caso',
  },
  noCourtInfo: {
    uk: 'Інформація про суд не заповнена',
    en: 'No court information provided',
    de: 'Keine Gerichtsinformationen vorhanden',
    es: 'No se proporcion\u00f3 informaci\u00f3n del tribunal',
  },
  activityHistory: {
    uk: 'Історія дій',
    en: 'Activity History',
    de: 'Aktivitatsverlauf',
    es: 'Historial de actividad',
  },

  // ─── Matter type labels ───
  typeLitigation: {
    uk: 'Судовий процес',
    en: 'Litigation',
    de: 'Rechtsstreit',
    es: 'Litigio',
  },
  typeAdvisory: {
    uk: 'Консультування',
    en: 'Advisory',
    de: 'Beratung',
    es: 'Asesor\u00eda',
  },
  typeTransactional: {
    uk: 'Транзакційна',
    en: 'Transactional',
    de: 'Transaktional',
    es: 'Transaccional',
  },
  typeRegulatory: {
    uk: 'Регуляторна',
    en: 'Regulatory',
    de: 'Regulatorisch',
    es: 'Regulatorio',
  },
  typeArbitration: {
    uk: 'Арбітраж',
    en: 'Arbitration',
    de: 'Schiedsverfahren',
    es: 'Arbitraje',
  },
  typeOther: {
    uk: 'Інше',
    en: 'Other',
    de: 'Sonstiges',
    es: 'Otro',
  },

  // ─── Role labels ───
  roleLeadAttorney: {
    uk: 'Головний адвокат',
    en: 'Lead Attorney',
    de: 'Leitender Anwalt',
    es: 'Abogado principal',
  },
  roleAssociate: {
    uk: 'Асоціат',
    en: 'Associate',
    de: 'Associate',
    es: 'Asociado',
  },
  roleParalegal: {
    uk: 'Паралегал',
    en: 'Paralegal',
    de: 'Rechtsanwaltsfachangestellter',
    es: 'Asistente legal',
  },
  roleCounsel: {
    uk: 'Консультант',
    en: 'Counsel',
    de: 'Berater',
    es: 'Consultor',
  },
  roleAdmin: {
    uk: 'Адміністратор',
    en: 'Admin',
    de: 'Administrator',
    es: 'Administrador',
  },
  roleObserver: {
    uk: 'Спостерігач',
    en: 'Observer',
    de: 'Beobachter',
    es: 'Observador',
  },

  // ─── Team tab ───
  matterTeam: {
    uk: 'Команда справи',
    en: 'Matter Team',
    de: 'Angelegenheitsteam',
    es: 'Equipo del asunto',
  },
  memberIdPlaceholder: {
    uk: 'ID учасника',
    en: 'Member ID',
    de: 'Mitglieds-ID',
    es: 'ID del miembro',
  },
  addButton: {
    uk: 'Додати',
    en: 'Add',
    de: 'Hinzufugen',
    es: 'Agregar',
  },
  noTeamMembers: {
    uk: 'Учасників ще немає',
    en: 'No team members yet',
    de: 'Noch keine Teammitglieder',
    es: 'A\u00fan no hay miembros del equipo',
  },
  removeTitle: {
    uk: 'Видалити',
    en: 'Remove',
    de: 'Entfernen',
    es: 'Eliminar',
  },

  // ─── CreateMatterModal ───
  newMatter: {
    uk: 'Нова справа',
    en: 'New Matter',
    de: 'Neue Angelegenheit',
    es: 'Nuevo asunto',
  },
  noClientsWarning: {
    uk: 'Немає клієнтів.',
    en: 'No clients found.',
    de: 'Keine Mandanten gefunden.',
    es: 'No se encontraron clientes.',
  },
  createClientFirst: {
    uk: 'Спочатку створіть клієнта на сторінці',
    en: 'First create a client on the',
    de: 'Erstellen Sie zuerst einen Mandanten auf der',
    es: 'Primero cree un cliente en la p\u00e1gina',
  },
  clientsPageLink: {
    uk: 'Клієнти',
    en: 'Clients',
    de: 'Mandanten',
    es: 'Clientes',
  },
  clientLabel: {
    uk: 'Клієнт',
    en: 'Client',
    de: 'Mandant',
    es: 'Cliente',
  },
  loadingText: {
    uk: 'Завантаження...',
    en: 'Loading...',
    de: 'Laden...',
    es: 'Cargando...',
  },
  noClientsOption: {
    uk: '— Клієнтів не знайдено —',
    en: '— No clients found —',
    de: '— Keine Mandanten gefunden —',
    es: '— No se encontraron clientes —',
  },
  matterNameLabel: {
    uk: 'Назва справи',
    en: 'Matter Name',
    de: 'Angelegenheitsname',
    es: 'Nombre del asunto',
  },
  matterNamePlaceholder: {
    uk: 'Наприклад: Спір щодо договору оренди',
    en: 'E.g.: Lease agreement dispute',
    de: 'Z.B.: Mietvertragsstreit',
    es: 'Ej.: Disputa de contrato de arrendamiento',
  },
  matterTypeLabel: {
    uk: 'Тип справи',
    en: 'Matter Type',
    de: 'Angelegenheitstyp',
    es: 'Tipo de asunto',
  },
  responsibleAttorney: {
    uk: 'Відповідальний адвокат',
    en: 'Responsible Attorney',
    de: 'Verantwortlicher Anwalt',
    es: 'Abogado responsable',
  },
  attorneyPlaceholder: {
    uk: "Прізвище Ім'я",
    en: 'Last Name First Name',
    de: 'Nachname Vorname',
    es: 'Apellido Nombre',
  },
  opposingPartyPlaceholder: {
    uk: 'Назва або ПІБ',
    en: 'Name or full name',
    de: 'Name oder vollstandiger Name',
    es: 'Nombre o nombre completo',
  },
  courtNumberLabel: {
    uk: 'Номер справи в суді',
    en: 'Court Case Number',
    de: 'Gerichtsaktenzeichen',
    es: 'N\u00famero de expediente',
  },
  courtNameLabel: {
    uk: 'Назва суду',
    en: 'Court Name',
    de: 'Gerichtsname',
    es: 'Nombre del tribunal',
  },
  courtNamePlaceholder: {
    uk: 'Господарський суд м. Києва',
    en: 'Commercial Court of Kyiv',
    de: 'Handelsgericht Kiew',
    es: 'Tribunal Comercial de Kiev',
  },
  cancelButton: {
    uk: 'Скасувати',
    en: 'Cancel',
    de: 'Abbrechen',
    es: 'Cancelar',
  },
  createButton: {
    uk: 'Створити',
    en: 'Create',
    de: 'Erstellen',
    es: 'Crear',
  },

  // ─── CreateHoldModal ───
  newHold: {
    uk: 'Нова заборона знищення',
    en: 'New Legal Hold',
    de: 'Neue Aufbewahrungspflicht',
    es: 'Nueva retenci\u00f3n legal',
  },
  holdNameLabel: {
    uk: 'Назва',
    en: 'Name',
    de: 'Name',
    es: 'Nombre',
  },
  holdNamePlaceholder: {
    uk: 'Наприклад: Заборона знищення документів для суду',
    en: 'E.g.: Court document preservation hold',
    de: 'Z.B.: Aufbewahrungspflicht fur Gerichtsdokumente',
    es: 'Ej.: Retenci\u00f3n de documentos para el tribunal',
  },
  holdTypeLabel: {
    uk: 'Тип',
    en: 'Type',
    de: 'Typ',
    es: 'Tipo',
  },
  holdTypeLitigation: {
    uk: 'Судовий процес',
    en: 'Litigation',
    de: 'Rechtsstreit',
    es: 'Litigio',
  },
  holdTypeRegulatory: {
    uk: 'Регуляторне',
    en: 'Regulatory',
    de: 'Regulatorisch',
    es: 'Regulatorio',
  },
  holdTypeInvestigation: {
    uk: 'Розслідування',
    en: 'Investigation',
    de: 'Ermittlung',
    es: 'Investigaci\u00f3n',
  },
  holdTypePreservation: {
    uk: 'Збереження',
    en: 'Preservation',
    de: 'Bewahrung',
    es: 'Preservaci\u00f3n',
  },
  scopeLabel: {
    uk: 'Опис обсягу',
    en: 'Scope Description',
    de: 'Umfangsbeschreibung',
    es: 'Descripci\u00f3n del alcance',
  },
  scopePlaceholder: {
    uk: 'Описати документи та дані, на які поширюється заборона знищення...',
    en: 'Describe the documents and data covered by this hold...',
    de: 'Beschreiben Sie die Dokumente und Daten, die von dieser Pflicht abgedeckt werden...',
    es: 'Describa los documentos y datos cubiertos por esta retenci\u00f3n...',
  },

  // ─── HoldsList ───
  holdsLoadError: {
    uk: 'Помилка завантаження заборон знищення',
    en: 'Failed to load legal holds',
    de: 'Aufbewahrungspflichten konnten nicht geladen werden',
    es: 'No se pudieron cargar las retenciones legales',
  },
  activeHoldsCount: {
    uk: 'активних',
    en: 'active',
    de: 'aktiv',
    es: 'activas',
  },
  createHold: {
    uk: 'Створити заборону',
    en: 'Create Hold',
    de: 'Pflicht erstellen',
    es: 'Crear retenci\u00f3n',
  },
  noHolds: {
    uk: 'Заборон знищення немає',
    en: 'No legal holds',
    de: 'Keine Aufbewahrungspflichten',
    es: 'No hay retenciones legales',
  },
  holdStatusActive: {
    uk: 'Активне',
    en: 'Active',
    de: 'Aktiv',
    es: 'Activa',
  },
  holdStatusReleased: {
    uk: 'Знято',
    en: 'Released',
    de: 'Aufgehoben',
    es: 'Liberada',
  },
  holdStatusExpired: {
    uk: 'Завершено',
    en: 'Expired',
    de: 'Abgelaufen',
    es: 'Expirada',
  },
  custodians: {
    uk: 'відповідальних',
    en: 'custodians',
    de: 'Verantwortliche',
    es: 'responsables',
  },
  releaseHoldButton: {
    uk: 'Зняти',
    en: 'Release',
    de: 'Aufheben',
    es: 'Liberar',
  },
  releasedAt: {
    uk: 'Знято:',
    en: 'Released:',
    de: 'Aufgehoben:',
    es: 'Liberada:',
  },

  // ─── ReleaseHoldConfirmation ───
  releaseHoldTitle: {
    uk: 'Зняти заборону знищення',
    en: 'Release Legal Hold',
    de: 'Aufbewahrungspflicht aufheben',
    es: 'Liberar retenci\u00f3n legal',
  },
  releaseHoldConfirmText: {
    uk: 'Ви впевнені, що хочете зняти заборону знищення?',
    en: 'Are you sure you want to release this legal hold?',
    de: 'Sind Sie sicher, dass Sie diese Aufbewahrungspflicht aufheben mochten?',
    es: '\u00bfEst\u00e1 seguro de que desea liberar esta retenci\u00f3n legal?',
  },
  releaseHoldWarning: {
    uk: 'буде знято. Документи, на які поширювалась ця заборона, більше не будуть захищені від видалення.',
    en: 'will be released. Documents covered by this hold will no longer be protected from deletion.',
    de: 'wird aufgehoben. Dokumente, die unter diese Pflicht fallen, sind nicht mehr vor Loschung geschutzt.',
    es: 'ser\u00e1 liberada. Los documentos cubiertos por esta retenci\u00f3n ya no estar\u00e1n protegidos contra eliminaci\u00f3n.',
  },
  releaseHoldAction: {
    uk: 'Зняти заборону',
    en: 'Release Hold',
    de: 'Pflicht aufheben',
    es: 'Liberar retenci\u00f3n',
  },

  // ─── MatterDocuments ───
  matterDocuments: {
    uk: 'Документи справи',
    en: 'Matter Documents',
    de: 'Angelegenheitsdokumente',
    es: 'Documentos del asunto',
  },
  docCountSingular: {
    uk: 'документ',
    en: 'document',
    de: 'Dokument',
    es: 'documento',
  },
  docCountFew: {
    uk: 'документи',
    en: 'documents',
    de: 'Dokumente',
    es: 'documentos',
  },
  docCountMany: {
    uk: 'документів',
    en: 'documents',
    de: 'Dokumente',
    es: 'documentos',
  },
  addDocuments: {
    uk: 'Додати документи',
    en: 'Add Documents',
    de: 'Dokumente hinzufugen',
    es: 'Agregar documentos',
  },
  noDocumentsYet: {
    uk: 'Документи ще не додані до цієї справи',
    en: 'No documents have been added to this matter yet',
    de: 'Es wurden noch keine Dokumente zu dieser Angelegenheit hinzugefugt',
    es: 'A\u00fan no se han agregado documentos a este asunto',
  },
  failedToLoadDoc: {
    uk: 'Не вдалося завантажити документ',
    en: 'Failed to load document',
    de: 'Dokument konnte nicht geladen werden',
    es: 'No se pudo cargar el documento',
  },
  removeFromMatter: {
    uk: 'Видалити зі справи',
    en: 'Remove from matter',
    de: 'Aus Angelegenheit entfernen',
    es: 'Eliminar del asunto',
  },
  addDocsToMatter: {
    uk: 'Додати документи до справи',
    en: 'Add Documents to Matter',
    de: 'Dokumente zur Angelegenheit hinzufugen',
    es: 'Agregar documentos al asunto',
  },
  searchDocuments: {
    uk: 'Пошук документів...',
    en: 'Search documents...',
    de: 'Dokumente suchen...',
    es: 'Buscar documentos...',
  },
  docsNotFound: {
    uk: 'Документів не знайдено',
    en: 'No documents found',
    de: 'Keine Dokumente gefunden',
    es: 'No se encontraron documentos',
  },
  noAvailableDocs: {
    uk: 'Немає доступних документів',
    en: 'No available documents',
    de: 'Keine verfugbaren Dokumente',
    es: 'No hay documentos disponibles',
  },
  selectedCount: {
    uk: 'Обрано:',
    en: 'Selected:',
    de: 'Ausgewahlt:',
    es: 'Seleccionados:',
  },

  // ─── Document type labels ───
  docTypeContract: {
    uk: 'Договір',
    en: 'Contract',
    de: 'Vertrag',
    es: 'Contrato',
  },
  docTypeLegislation: {
    uk: 'Законодавство',
    en: 'Legislation',
    de: 'Gesetzgebung',
    es: 'Legislaci\u00f3n',
  },
  docTypeCourtDecision: {
    uk: 'Судове рішення',
    en: 'Court Decision',
    de: 'Gerichtsentscheidung',
    es: 'Resoluci\u00f3n judicial',
  },
  docTypeInternal: {
    uk: 'Внутрішній',
    en: 'Internal',
    de: 'Intern',
    es: 'Interno',
  },
  docTypeOther: {
    uk: 'Інше',
    en: 'Other',
    de: 'Sonstiges',
    es: 'Otro',
  },

  // ─── ConsultationsPage ───
  consultationsTitle: {
    uk: 'Консультації',
    en: 'Consultations',
    de: 'Beratungen',
    es: 'Consultas',
  },
  listTab: {
    uk: 'Список',
    en: 'List',
    de: 'Liste',
    es: 'Lista',
  },
  payoutsTab: {
    uk: 'Виплати',
    en: 'Payouts',
    de: 'Auszahlungen',
    es: 'Pagos',
  },
  credited: {
    uk: 'Зараховано',
    en: 'Credited',
    de: 'Gutgeschrieben',
    es: 'Acreditado',
  },
  pending: {
    uk: 'Очікує',
    en: 'Pending',
    de: 'Ausstehend',
    es: 'Pendiente',
  },
  noPayoutsYet: {
    uk: 'Виплат поки немає',
    en: 'No payouts yet',
    de: 'Noch keine Auszahlungen',
    es: 'A\u00fan no hay pagos',
  },
  payoutsAfterCompletion: {
    uk: "Виплати з'являться після завершення консультацій",
    en: 'Payouts will appear after consultations are completed',
    de: 'Auszahlungen erscheinen nach Abschluss der Beratungen',
    es: 'Los pagos aparecer\u00e1n despu\u00e9s de completar las consultas',
  },
  payoutStatusPending: {
    uk: 'Очікує',
    en: 'Pending',
    de: 'Ausstehend',
    es: 'Pendiente',
  },
  payoutStatusProcessing: {
    uk: 'Обробка',
    en: 'Processing',
    de: 'In Bearbeitung',
    es: 'Procesando',
  },
  payoutStatusCompleted: {
    uk: 'Зараховано',
    en: 'Completed',
    de: 'Abgeschlossen',
    es: 'Completado',
  },
  payoutStatusFailed: {
    uk: 'Помилка',
    en: 'Failed',
    de: 'Fehlgeschlagen',
    es: 'Fallido',
  },
  allRoles: {
    uk: 'Всі ролі',
    en: 'All roles',
    de: 'Alle Rollen',
    es: 'Todos los roles',
  },
  asClient: {
    uk: 'Як клієнт',
    en: 'As client',
    de: 'Als Mandant',
    es: 'Como cliente',
  },
  asAttorney: {
    uk: 'Як адвокат',
    en: 'As attorney',
    de: 'Als Anwalt',
    es: 'Como abogado',
  },
  allStatuses: {
    uk: 'Всі статуси',
    en: 'All statuses',
    de: 'Alle Status',
    es: 'Todos los estados',
  },
  noConsultationsYet: {
    uk: 'Консультацій поки немає',
    en: 'No consultations yet',
    de: 'Noch keine Beratungen',
    es: 'A\u00fan no hay consultas',
  },
  findAttorneyPrompt: {
    uk: 'Знайдіть адвоката та створіть запит на консультацію',
    en: 'Find an attorney and create a consultation request',
    de: 'Finden Sie einen Anwalt und erstellen Sie eine Beratungsanfrage',
    es: 'Encuentre un abogado y cree una solicitud de consulta',
  },
  totalCount: {
    uk: 'Всього:',
    en: 'Total:',
    de: 'Gesamt:',
    es: 'Total:',
  },
  clientPrefix: {
    uk: 'Клієнт:',
    en: 'Client:',
    de: 'Mandant:',
    es: 'Cliente:',
  },
  attorneyPrefix: {
    uk: 'Адвокат:',
    en: 'Attorney:',
    de: 'Anwalt:',
    es: 'Abogado:',
  },
  matterPrefix: {
    uk: 'Справа:',
    en: 'Matter:',
    de: 'Angelegenheit:',
    es: 'Asunto:',
  },
  representation: {
    uk: 'Представництво',
    en: 'Representation',
    de: 'Vertretung',
    es: 'Representaci\u00f3n',
  },
  documentReview: {
    uk: 'Аналіз документів',
    en: 'Document Review',
    de: 'Dokumentenprufung',
    es: 'Revisi\u00f3n de documentos',
  },

  // ─── Consultation statuses ───
  cStatusPending: {
    uk: 'Очікує',
    en: 'Pending',
    de: 'Ausstehend',
    es: 'Pendiente',
  },
  cStatusAccepted: {
    uk: 'Прийнято',
    en: 'Accepted',
    de: 'Akzeptiert',
    es: 'Aceptada',
  },
  cStatusPaid: {
    uk: 'Оплачено',
    en: 'Paid',
    de: 'Bezahlt',
    es: 'Pagada',
  },
  cStatusInProgress: {
    uk: 'В роботі',
    en: 'In Progress',
    de: 'In Bearbeitung',
    es: 'En progreso',
  },
  cStatusCompleted: {
    uk: 'Завершено',
    en: 'Completed',
    de: 'Abgeschlossen',
    es: 'Completada',
  },
  cStatusCancelled: {
    uk: 'Скасовано',
    en: 'Cancelled',
    de: 'Storniert',
    es: 'Cancelada',
  },
  cStatusDeclined: {
    uk: 'Відхилено',
    en: 'Declined',
    de: 'Abgelehnt',
    es: 'Rechazada',
  },
  cStatusDisputed: {
    uk: 'Спір',
    en: 'Disputed',
    de: 'Streit',
    es: 'Disputada',
  },

  // ─── ConsultationDetailPage ───
  consultationNotFound: {
    uk: 'Консультацію не знайдено',
    en: 'Consultation not found',
    de: 'Beratung nicht gefunden',
    es: 'Consulta no encontrada',
  },
  backLabel: {
    uk: 'Назад',
    en: 'Back',
    de: 'Zuruck',
    es: 'Atr\u00e1s',
  },
  backToConsultations: {
    uk: 'Назад до консультацій',
    en: 'Back to consultations',
    de: 'Zuruck zu Beratungen',
    es: 'Volver a consultas',
  },
  feeLabel: {
    uk: 'Вартість:',
    en: 'Fee:',
    de: 'Gebuhr:',
    es: 'Tarifa:',
  },
  uahCurrency: {
    uk: 'грн',
    en: 'UAH',
    de: 'UAH',
    es: 'UAH',
  },
  reasonPrefix: {
    uk: 'Причина:',
    en: 'Reason:',
    de: 'Grund:',
    es: 'Raz\u00f3n:',
  },
  acceptButton: {
    uk: 'Прийняти',
    en: 'Accept',
    de: 'Akzeptieren',
    es: 'Aceptar',
  },
  declineButton: {
    uk: 'Відхилити',
    en: 'Decline',
    de: 'Ablehnen',
    es: 'Rechazar',
  },
  payButton: {
    uk: 'Оплатити',
    en: 'Pay',
    de: 'Bezahlen',
    es: 'Pagar',
  },
  startWork: {
    uk: 'Почати роботу',
    en: 'Start Work',
    de: 'Arbeit beginnen',
    es: 'Iniciar trabajo',
  },
  completeButton: {
    uk: 'Завершити',
    en: 'Complete',
    de: 'Abschliessen',
    es: 'Completar',
  },
  leaveReview: {
    uk: 'Залишити відгук',
    en: 'Leave Review',
    de: 'Bewertung abgeben',
    es: 'Dejar rese\u00f1a',
  },
  messagesTitle: {
    uk: 'Повідомлення',
    en: 'Messages',
    de: 'Nachrichten',
    es: 'Mensajes',
  },

  // ─── Decline modal ───
  declineTitle: {
    uk: 'Відхилити консультацію',
    en: 'Decline Consultation',
    de: 'Beratung ablehnen',
    es: 'Rechazar consulta',
  },
  declineDescription: {
    uk: 'Ви впевнені, що хочете відхилити цей запит?',
    en: 'Are you sure you want to decline this request?',
    de: 'Sind Sie sicher, dass Sie diese Anfrage ablehnen mochten?',
    es: '\u00bfEst\u00e1 seguro de que desea rechazar esta solicitud?',
  },
  declineReasonLabel: {
    uk: 'Причина відмови',
    en: 'Decline Reason',
    de: 'Ablehnungsgrund',
    es: 'Motivo del rechazo',
  },
  declineReasonPlaceholder: {
    uk: "Вкажіть причину відмови (необов'язково)...",
    en: 'Enter reason for declining (optional)...',
    de: 'Geben Sie den Ablehnungsgrund ein (optional)...',
    es: 'Indique el motivo del rechazo (opcional)...',
  },

  // ─── Complete modal ───
  completeTitle: {
    uk: 'Завершити консультацію',
    en: 'Complete Consultation',
    de: 'Beratung abschliessen',
    es: 'Completar consulta',
  },
  completeDescription: {
    uk: 'Після завершення клієнт зможе залишити відгук, а кошти будуть звільнені.',
    en: 'After completion, the client can leave a review and funds will be released.',
    de: 'Nach Abschluss kann der Mandant eine Bewertung abgeben und die Mittel werden freigegeben.',
    es: 'Despu\u00e9s de completar, el cliente podr\u00e1 dejar una rese\u00f1a y los fondos ser\u00e1n liberados.',
  },
  summaryLabel: {
    uk: 'Підсумок консультації',
    en: 'Consultation Summary',
    de: 'Beratungszusammenfassung',
    es: 'Resumen de la consulta',
  },
  summaryPlaceholder: {
    uk: 'Опишіть результати консультації...',
    en: 'Describe the consultation results...',
    de: 'Beschreiben Sie die Ergebnisse der Beratung...',
    es: 'Describa los resultados de la consulta...',
  },

  // ─── Cancel modal ───
  cancelTitle: {
    uk: 'Скасувати консультацію',
    en: 'Cancel Consultation',
    de: 'Beratung stornieren',
    es: 'Cancelar consulta',
  },
  cancelDescription: {
    uk: 'Ви впевнені? Якщо оплата вже здійснена, кошти будуть повернені.',
    en: 'Are you sure? If payment has been made, funds will be refunded.',
    de: 'Sind Sie sicher? Bei bereits erfolgter Zahlung werden die Mittel zuruckerstattet.',
    es: '\u00bfEst\u00e1 seguro? Si ya se realiz\u00f3 el pago, los fondos ser\u00e1n reembolsados.',
  },
  cancelConsultation: {
    uk: 'Скасувати консультацію',
    en: 'Cancel Consultation',
    de: 'Beratung stornieren',
    es: 'Cancelar consulta',
  },
  cancelReasonLabel: {
    uk: 'Причина скасування',
    en: 'Cancellation Reason',
    de: 'Stornierungsgrund',
    es: 'Motivo de cancelaci\u00f3n',
  },
  cancelReasonPlaceholder: {
    uk: 'Вкажіть причину скасування...',
    en: 'Enter cancellation reason...',
    de: 'Geben Sie den Stornierungsgrund ein...',
    es: 'Indique el motivo de cancelaci\u00f3n...',
  },

  // ─── Escrow modal ───
  escrowTitle: {
    uk: 'Безпечна оплата Escrow',
    en: 'Secure Escrow Payment',
    de: 'Sichere Treuhandzahlung',
    es: 'Pago seguro Escrow',
  },
  escrowSubtitle: {
    uk: 'Захист покупця через Monobank',
    en: 'Buyer protection via Monobank',
    de: 'Kauferschutz uber Monobank',
    es: 'Protecci\u00f3n del comprador a trav\u00e9s de Monobank',
  },
  serviceLabel: {
    uk: 'Послуга',
    en: 'Service',
    de: 'Dienstleistung',
    es: 'Servicio',
  },
  reservationAmount: {
    uk: 'Сума резервування',
    en: 'Reservation Amount',
    de: 'Reservierungsbetrag',
    es: 'Monto de reserva',
  },
  attorneyPayout: {
    uk: 'Виплата адвокату (70%)',
    en: 'Attorney payout (70%)',
    de: 'Anwaltsauszahlung (70%)',
    es: 'Pago al abogado (70%)',
  },
  platformFee: {
    uk: 'Комісія платформи (30%)',
    en: 'Platform fee (30%)',
    de: 'Plattformgebuhr (30%)',
    es: 'Comisi\u00f3n de la plataforma (30%)',
  },
  acquiringIncluded: {
    uk: 'Еквайрінг Monobank',
    en: 'Monobank acquiring',
    de: 'Monobank Acquiring',
    es: 'Adquisici\u00f3n Monobank',
  },
  included: {
    uk: 'включено',
    en: 'included',
    de: 'inkludiert',
    es: 'incluido',
  },
  escrowFreezeInfo: {
    uk: 'Кошти будуть <strong>заморожені</strong> на вашій картці Visa/Mastercard, а не списані. Адвокат отримає оплату лише після завершення консультації.',
    en: 'Funds will be <strong>frozen</strong> on your Visa/Mastercard, not charged. The attorney will receive payment only after the consultation is completed.',
    de: 'Die Mittel werden auf Ihrer Visa/Mastercard <strong>eingefroren</strong>, nicht abgebucht. Der Anwalt erhalt die Zahlung erst nach Abschluss der Beratung.',
    es: 'Los fondos ser\u00e1n <strong>congelados</strong> en su tarjeta Visa/Mastercard, no cobrados. El abogado recibir\u00e1 el pago solo despu\u00e9s de completar la consulta.',
  },
  escrowRefundInfo: {
    uk: 'Ви можете <strong>відмовитися</strong> від консультації в будь-який момент до її початку — кошти будуть автоматично розморожені.',
    en: 'You can <strong>cancel</strong> the consultation at any time before it starts — funds will be automatically unfrozen.',
    de: 'Sie konnen die Beratung jederzeit vor Beginn <strong>stornieren</strong> — die Mittel werden automatisch freigegeben.',
    es: 'Puede <strong>cancelar</strong> la consulta en cualquier momento antes de que comience — los fondos ser\u00e1n descongelados autom\u00e1ticamente.',
  },
  confirmAndPay: {
    uk: 'Підтвердити та оплатити',
    en: 'Confirm & Pay',
    de: 'Bestatigen & Bezahlen',
    es: 'Confirmar y pagar',
  },

  // ─── Accept fee modal ───
  acceptConsultation: {
    uk: 'Прийняти консультацію',
    en: 'Accept Consultation',
    de: 'Beratung akzeptieren',
    es: 'Aceptar consulta',
  },
  acceptFeeDescription: {
    uk: 'Вкажіть суму гонорару, яку буде зарезервовано на картці клієнта',
    en: 'Enter the fee amount to be reserved on the client\'s card',
    de: 'Geben Sie den Gebuhrbetrag ein, der auf der Karte des Mandanten reserviert wird',
    es: 'Ingrese el monto de los honorarios que se reservar\u00e1 en la tarjeta del cliente',
  },
  feeAmountLabel: {
    uk: 'Сума гонорару (грн)',
    en: 'Fee amount (UAH)',
    de: 'Gebuhr (UAH)',
    es: 'Monto de honorarios (UAH)',
  },
  feeAmountPlaceholder: {
    uk: 'Наприклад: 2000',
    en: 'E.g.: 2000',
    de: 'Z.B.: 2000',
    es: 'Ej.: 2000',
  },
  acceptFor: {
    uk: 'Прийняти за',
    en: 'Accept for',
    de: 'Akzeptieren fur',
    es: 'Aceptar por',
  },

  // ─── Review modal ───
  rateConsultation: {
    uk: 'Оцініть консультацію',
    en: 'Rate Consultation',
    de: 'Beratung bewerten',
    es: 'Calificar consulta',
  },
  reviewPlaceholder: {
    uk: "Ваш відгук (необов'язково)...",
    en: 'Your review (optional)...',
    de: 'Ihre Bewertung (optional)...',
    es: 'Su rese\u00f1a (opcional)...',
  },
  sendButton: {
    uk: 'Надіслати',
    en: 'Send',
    de: 'Senden',
    es: 'Enviar',
  },

  // ─── ConsultationRequestModal ───
  consultationType: {
    uk: 'Консультація',
    en: 'Consultation',
    de: 'Beratung',
    es: 'Consulta',
  },
  representationType: {
    uk: 'Представництво в суді',
    en: 'Court Representation',
    de: 'Gerichtsvertretung',
    es: 'Representaci\u00f3n en tribunal',
  },
  documentReviewType: {
    uk: 'Аналіз документів',
    en: 'Document Review',
    de: 'Dokumentenprufung',
    es: 'Revisi\u00f3n de documentos',
  },
  urgencyLow: {
    uk: 'Низька',
    en: 'Low',
    de: 'Niedrig',
    es: 'Baja',
  },
  urgencyNormal: {
    uk: 'Звичайна',
    en: 'Normal',
    de: 'Normal',
    es: 'Normal',
  },
  urgencyHigh: {
    uk: 'Висока',
    en: 'High',
    de: 'Hoch',
    es: 'Alta',
  },
  urgencyUrgent: {
    uk: 'Термінова',
    en: 'Urgent',
    de: 'Dringend',
    es: 'Urgente',
  },
  stepRequestDetails: {
    uk: 'Деталі запиту',
    en: 'Request Details',
    de: 'Anforderungsdetails',
    es: 'Detalles de la solicitud',
  },
  stepChats: {
    uk: 'Чати',
    en: 'Chats',
    de: 'Chats',
    es: 'Chats',
  },
  stepDocuments: {
    uk: 'Документи',
    en: 'Documents',
    de: 'Dokumente',
    es: 'Documentos',
  },
  stepConfirmation: {
    uk: 'Підтвердження',
    en: 'Confirmation',
    de: 'Bestatigung',
    es: 'Confirmaci\u00f3n',
  },
  stepPayment: {
    uk: 'Оплата',
    en: 'Payment',
    de: 'Zahlung',
    es: 'Pago',
  },
  serviceTypeLabel: {
    uk: 'Тип послуги',
    en: 'Service Type',
    de: 'Dienstleistungsart',
    es: 'Tipo de servicio',
  },
  requestTopicLabel: {
    uk: 'Тема запиту *',
    en: 'Request Topic *',
    de: 'Anfragethema *',
    es: 'Tema de la solicitud *',
  },
  requestTopicPlaceholder: {
    uk: 'Коротко опишіть проблему',
    en: 'Briefly describe the issue',
    de: 'Beschreiben Sie das Problem kurz',
    es: 'Describa brevemente el problema',
  },
  detailedDescription: {
    uk: 'Детальний опис',
    en: 'Detailed Description',
    de: 'Detaillierte Beschreibung',
    es: 'Descripci\u00f3n detallada',
  },
  detailedDescPlaceholder: {
    uk: 'Опишіть ситуацію детальніше...',
    en: 'Describe the situation in more detail...',
    de: 'Beschreiben Sie die Situation ausfuhrlicher...',
    es: 'Describa la situaci\u00f3n con m\u00e1s detalle...',
  },
  urgencyLabel: {
    uk: 'Терміновість',
    en: 'Urgency',
    de: 'Dringlichkeit',
    es: 'Urgencia',
  },
  shareDocumentsLabel: {
    uk: 'Надати доступ до документів справи',
    en: 'Share matter documents',
    de: 'Angelegenheitsdokumente teilen',
    es: 'Compartir documentos del asunto',
  },
  shareChatsLabel: {
    uk: 'Надати доступ до чатів справи',
    en: 'Share matter chats',
    de: 'Angelegenheitschats teilen',
    es: 'Compartir chats del asunto',
  },
  enterTopicError: {
    uk: 'Введіть тему запиту',
    en: 'Enter request topic',
    de: 'Geben Sie das Anfragethema ein',
    es: 'Ingrese el tema de la solicitud',
  },

  // ─── ConfirmStep ───
  descriptionLabel: {
    uk: 'Опис',
    en: 'Description',
    de: 'Beschreibung',
    es: 'Descripci\u00f3n',
  },
  topicLabel: {
    uk: 'Тема',
    en: 'Topic',
    de: 'Thema',
    es: 'Tema',
  },
  chatsLabel: {
    uk: 'Чати',
    en: 'Chats',
    de: 'Chats',
    es: 'Chats',
  },
  noChatsSelected: {
    uk: 'Чати не вибрані',
    en: 'No chats selected',
    de: 'Keine Chats ausgewahlt',
    es: 'No se seleccionaron chats',
  },
  documentsLabel: {
    uk: 'Документи',
    en: 'Documents',
    de: 'Dokumente',
    es: 'Documentos',
  },
  noDocsSelected: {
    uk: 'Документи не вибрані',
    en: 'No documents selected',
    de: 'Keine Dokumente ausgewahlt',
    es: 'No se seleccionaron documentos',
  },
  untitled: {
    uk: 'Без назви',
    en: 'Untitled',
    de: 'Ohne Titel',
    es: 'Sin t\u00edtulo',
  },
  nextToPayment: {
    uk: 'Далі до оплати',
    en: 'Next to Payment',
    de: 'Weiter zur Zahlung',
    es: 'Siguiente al pago',
  },

  // ─── ConversationPicker ───
  searchChatsPlaceholder: {
    uk: 'Пошук чатів...',
    en: 'Search chats...',
    de: 'Chats suchen...',
    es: 'Buscar chats...',
  },
  noChatsYet: {
    uk: 'У вас ще немає чатів',
    en: 'You have no chats yet',
    de: 'Sie haben noch keine Chats',
    es: 'A\u00fan no tiene chats',
  },
  nothingFound: {
    uk: 'Нічого не знайдено',
    en: 'Nothing found',
    de: 'Nichts gefunden',
    es: 'No se encontr\u00f3 nada',
  },
  continueWith: {
    uk: 'Продовжити',
    en: 'Continue',
    de: 'Fortfahren',
    es: 'Continuar',
  },
  skipButton: {
    uk: 'Пропустити',
    en: 'Skip',
    de: 'Uberspringen',
    es: 'Omitir',
  },

  // ─── DocumentPicker ───
  allFolders: {
    uk: 'Усі папки',
    en: 'All folders',
    de: 'Alle Ordner',
    es: 'Todas las carpetas',
  },
  searchDocsPlaceholder: {
    uk: 'Пошук документів...',
    en: 'Search documents...',
    de: 'Dokumente suchen...',
    es: 'Buscar documentos...',
  },
  loadingAll: {
    uk: 'Завантаження всіх',
    en: 'Loading all',
    de: 'Alle laden',
    es: 'Cargando todos',
  },
  deselectAll: {
    uk: 'Зняти вибір',
    en: 'Deselect all',
    de: 'Auswahl aufheben',
    es: 'Deseleccionar todo',
  },
  selectAllIn: {
    uk: 'Вибрати все',
    en: 'Select all',
    de: 'Alle auswahlen',
    es: 'Seleccionar todo',
  },
  inFolder: {
    uk: 'в',
    en: 'in',
    de: 'in',
    es: 'en',
  },
  folderEmpty: {
    uk: 'порожня',
    en: 'is empty',
    de: 'ist leer',
    es: 'est\u00e1 vac\u00eda',
  },
  noDocsYet: {
    uk: 'У вас ще немає документів',
    en: 'You have no documents yet',
    de: 'Sie haben noch keine Dokumente',
    es: 'A\u00fan no tiene documentos',
  },
  loadMore: {
    uk: 'Завантажити ще',
    en: 'Load more',
    de: 'Mehr laden',
    es: 'Cargar m\u00e1s',
  },

  // ─── PaymentStep ───
  freeCreating: {
    uk: 'Безкоштовно — створюємо запит...',
    en: 'Free — creating request...',
    de: 'Kostenlos — Anfrage wird erstellt...',
    es: 'Gratis — creando solicitud...',
  },
  orderLabel: {
    uk: 'Замовлення',
    en: 'Order',
    de: 'Bestellung',
    es: 'Pedido',
  },
  costLabel: {
    uk: 'Вартість',
    en: 'Cost',
    de: 'Kosten',
    es: 'Costo',
  },
  creatingRequest: {
    uk: 'Створюємо запит на консультацію...',
    en: 'Creating consultation request...',
    de: 'Beratungsanfrage wird erstellt...',
    es: 'Creando solicitud de consulta...',
  },
  requestCreated: {
    uk: 'Запит створено',
    en: 'Request created',
    de: 'Anfrage erstellt',
    es: 'Solicitud creada',
  },
  paymentInfoSecure: {
    uk: 'Після того, як адвокат прийме ваш запит, ви зможете здійснити <strong>безпечну оплату через Monobank</strong> на сторінці консультації.',
    en: 'After the attorney accepts your request, you can make a <strong>secure payment via Monobank</strong> on the consultation page.',
    de: 'Nachdem der Anwalt Ihre Anfrage angenommen hat, konnen Sie eine <strong>sichere Zahlung uber Monobank</strong> auf der Beratungsseite vornehmen.',
    es: 'Despu\u00e9s de que el abogado acepte su solicitud, podr\u00e1 realizar un <strong>pago seguro a trav\u00e9s de Monobank</strong> en la p\u00e1gina de la consulta.',
  },
  paymentInfoEscrow: {
    uk: 'Кошти будуть <strong>заморожені (escrow)</strong> і передані адвокату лише після завершення консультації.',
    en: 'Funds will be <strong>frozen (escrow)</strong> and released to the attorney only after the consultation is completed.',
    de: 'Die Mittel werden <strong>eingefroren (Treuhand)</strong> und erst nach Abschluss der Beratung an den Anwalt freigegeben.',
    es: 'Los fondos ser\u00e1n <strong>congelados (escrow)</strong> y liberados al abogado solo despu\u00e9s de completar la consulta.',
  },
  confirmAndCreate: {
    uk: 'Підтвердити та створити запит',
    en: 'Confirm & Create Request',
    de: 'Bestatigen & Anfrage erstellen',
    es: 'Confirmar y crear solicitud',
  },
  paymentAfterAcceptance: {
    uk: 'Оплата здійснюється після прийняття запиту адвокатом',
    en: 'Payment is made after the attorney accepts the request',
    de: 'Die Zahlung erfolgt nach Annahme der Anfrage durch den Anwalt',
    es: 'El pago se realiza despu\u00e9s de que el abogado acepte la solicitud',
  },

  // ─── SharedDocumentsSection ───
  sharedDocuments: {
    uk: 'Спільні документи',
    en: 'Shared Documents',
    de: 'Geteilte Dokumente',
    es: 'Documentos compartidos',
  },
  docsNotFoundShort: {
    uk: 'Документи не знайдено',
    en: 'Documents not found',
    de: 'Dokumente nicht gefunden',
    es: 'Documentos no encontrados',
  },
  revokeAccess: {
    uk: 'Відкликати',
    en: 'Revoke',
    de: 'Widerrufen',
    es: 'Revocar',
  },
  revokeAccessTitle: {
    uk: 'Відкликати доступ до зашифрованого документа',
    en: 'Revoke access to encrypted document',
    de: 'Zugriff auf verschlusseltes Dokument widerrufen',
    es: 'Revocar acceso al documento cifrado',
  },

  // ─── AttorneySearchPage ───
  findAttorney: {
    uk: 'Знайти адвоката',
    en: 'Find an Attorney',
    de: 'Anwalt finden',
    es: 'Encontrar un abogado',
  },
  filtersButton: {
    uk: 'Фільтри',
    en: 'Filters',
    de: 'Filter',
    es: 'Filtros',
  },
  marketplaceRules: {
    uk: 'Правила маркетплейсу юридичних консультацій',
    en: 'Legal consultation marketplace rules',
    de: 'Regeln des Rechtsberatungsmarktplatzes',
    es: 'Reglas del mercado de consultas legales',
  },
  marketplaceRulesDescription: {
    uk: 'Ознайомтесь з умовами замовлення консультацій, оплати та захисту ваших прав як клієнта',
    en: 'Learn about consultation ordering, payment, and your client rights protection',
    de: 'Erfahren Sie mehr uber Beratungsbestellung, Zahlung und den Schutz Ihrer Mandantenrechte',
    es: 'Conozca las condiciones de pedido de consultas, pago y protecci\u00f3n de sus derechos como cliente',
  },
  openLink: {
    uk: 'Відкрити',
    en: 'Open',
    de: 'Offnen',
    es: 'Abrir',
  },
  specLabel: {
    uk: 'Спеціалізація',
    en: 'Specialization',
    de: 'Spezialisierung',
    es: 'Especializaci\u00f3n',
  },
  allSpecializations: {
    uk: 'Всі',
    en: 'All',
    de: 'Alle',
    es: 'Todas',
  },
  regionLabel: {
    uk: 'Регіон',
    en: 'Region',
    de: 'Region',
    es: 'Regi\u00f3n',
  },
  regionPlaceholder: {
    uk: 'Напр. Київ',
    en: 'E.g. Kyiv',
    de: 'Z.B. Kiew',
    es: 'Ej. Kiev',
  },
  maxFeeLabel: {
    uk: 'Макс. вартість (грн)',
    en: 'Max fee (UAH)',
    de: 'Max. Gebuhr (UAH)',
    es: 'Tarifa m\u00e1x. (UAH)',
  },
  sortLabel: {
    uk: 'Сортування',
    en: 'Sort',
    de: 'Sortierung',
    es: 'Ordenar',
  },
  sortByRating: {
    uk: 'За рейтингом',
    en: 'By rating',
    de: 'Nach Bewertung',
    es: 'Por calificaci\u00f3n',
  },
  sortByPriceAsc: {
    uk: 'Ціна (зростання)',
    en: 'Price (ascending)',
    de: 'Preis (aufsteigend)',
    es: 'Precio (ascendente)',
  },
  sortByPriceDesc: {
    uk: 'Ціна (спадання)',
    en: 'Price (descending)',
    de: 'Preis (absteigend)',
    es: 'Precio (descendente)',
  },
  sortByExperience: {
    uk: 'За досвідом',
    en: 'By experience',
    de: 'Nach Erfahrung',
    es: 'Por experiencia',
  },
  freeConsultation: {
    uk: 'Безкоштовна консультація',
    en: 'Free consultation',
    de: 'Kostenlose Beratung',
    es: 'Consulta gratuita',
  },
  noAttorneysFound: {
    uk: 'Адвокатів не знайдено',
    en: 'No attorneys found',
    de: 'Keine Anwalte gefunden',
    es: 'No se encontraron abogados',
  },
  adjustSearchFilters: {
    uk: 'Спробуйте змінити фільтри пошуку',
    en: 'Try adjusting your search filters',
    de: 'Versuchen Sie, Ihre Suchfilter anzupassen',
    es: 'Intente ajustar los filtros de b\u00fasqueda',
  },
  foundCount: {
    uk: 'Знайдено:',
    en: 'Found:',
    de: 'Gefunden:',
    es: 'Encontrados:',
  },
  yearsExperience: {
    uk: 'р. досвіду',
    en: 'yr. experience',
    de: 'J. Erfahrung',
    es: 'a\u00f1os de experiencia',
  },
  byAgreement: {
    uk: 'За домовленістю',
    en: 'By agreement',
    de: 'Nach Vereinbarung',
    es: 'Por acuerdo',
  },
  firstFree: {
    uk: 'Перша безкоштовно',
    en: 'First free',
    de: 'Erste kostenlos',
    es: 'Primera gratis',
  },

  // ─── Specializations ───
  specCriminal: {
    uk: 'Кримінальне',
    en: 'Criminal',
    de: 'Strafrecht',
    es: 'Penal',
  },
  specCivil: {
    uk: 'Цивільне',
    en: 'Civil',
    de: 'Zivilrecht',
    es: 'Civil',
  },
  specAdministrative: {
    uk: 'Адміністративне',
    en: 'Administrative',
    de: 'Verwaltungsrecht',
    es: 'Administrativo',
  },
  specCommercial: {
    uk: 'Господарське',
    en: 'Commercial',
    de: 'Handelsrecht',
    es: 'Comercial',
  },
  specFamily: {
    uk: 'Сімейне',
    en: 'Family',
    de: 'Familienrecht',
    es: 'Familiar',
  },
  specLabor: {
    uk: 'Трудове',
    en: 'Labor',
    de: 'Arbeitsrecht',
    es: 'Laboral',
  },
  specTax: {
    uk: 'Податкове',
    en: 'Tax',
    de: 'Steuerrecht',
    es: 'Fiscal',
  },
  specIP: {
    uk: 'Інтелектуальна власність',
    en: 'Intellectual Property',
    de: 'Geistiges Eigentum',
    es: 'Propiedad intelectual',
  },
  specRealEstate: {
    uk: 'Нерухомість',
    en: 'Real Estate',
    de: 'Immobilienrecht',
    es: 'Bienes ra\u00edces',
  },

  // ─── AttorneyOfferModal ───
  offerTitle: {
    uk: 'Публічна оферта для адвокатів',
    en: 'Public Offer for Attorneys',
    de: 'Offentliches Angebot fur Anwalte',
    es: 'Oferta p\u00fablica para abogados',
  },
  offerDescription: {
    uk: 'Будь ласка, ознайомтеся та прийміть оферту для продовження роботи',
    en: 'Please review and accept the offer to continue',
    de: 'Bitte lesen und akzeptieren Sie das Angebot, um fortzufahren',
    es: 'Por favor revise y acepte la oferta para continuar',
  },
  scrollToAccept: {
    uk: 'Прокрутіть до кінця документу, щоб прийняти оферту',
    en: 'Scroll to the bottom of the document to accept the offer',
    de: 'Scrollen Sie zum Ende des Dokuments, um das Angebot anzunehmen',
    es: 'Despl\u00e1cese hasta el final del documento para aceptar la oferta',
  },
  acceptOffer: {
    uk: 'Прийняти оферту',
    en: 'Accept Offer',
    de: 'Angebot annehmen',
    es: 'Aceptar oferta',
  },
  offerAccepted: {
    uk: 'Оферту прийнято!',
    en: 'Offer accepted!',
    de: 'Angebot angenommen!',
    es: '\u00a1Oferta aceptada!',
  },
  contractLabel: {
    uk: 'Договір',
    en: 'Contract',
    de: 'Vertrag',
    es: 'Contrato',
  },
  datedLabel: {
    uk: 'від',
    en: 'dated',
    de: 'vom',
    es: 'del',
  },
  offerAcceptError: {
    uk: 'Помилка при прийнятті оферти',
    en: 'Error accepting offer',
    de: 'Fehler beim Annehmen des Angebots',
    es: 'Error al aceptar la oferta',
  },

  // ─── Step1Welcome ───
  welcomeTitle: {
    uk: 'Ласкаво просимо до SecondLayer!',
    en: 'Welcome to SecondLayer!',
    de: 'Willkommen bei SecondLayer!',
    es: '\u00a1Bienvenido a SecondLayer!',
  },
  welcomeSubtitle: {
    uk: 'Створіть свій профіль адвоката та отримайте доступ до повного набору інструментів для юридичної практики.',
    en: 'Create your attorney profile and get access to the full set of tools for legal practice.',
    de: 'Erstellen Sie Ihr Anwaltsprofil und erhalten Sie Zugang zum vollstandigen Werkzeugset fur die Rechtspraxis.',
    es: 'Cree su perfil de abogado y obtenga acceso al conjunto completo de herramientas para la pr\u00e1ctica legal.',
  },
  feature1: {
    uk: 'Пошук та аналіз судових рішень з AI',
    en: 'AI-powered court decision search and analysis',
    de: 'KI-gestutzte Suche und Analyse von Gerichtsentscheidungen',
    es: 'B\u00fasqueda y an\u00e1lisis de resoluciones judiciales con IA',
  },
  feature2: {
    uk: 'Консультації з клієнтами через платформу',
    en: 'Client consultations through the platform',
    de: 'Mandantenberatung uber die Plattform',
    es: 'Consultas con clientes a trav\u00e9s de la plataforma',
  },
  feature3: {
    uk: 'Автоматичне заповнення профілю з ЄРАУ',
    en: 'Auto-fill profile from ERAU registry',
    de: 'Automatische Profilbefullung aus dem ERAU-Register',
    es: 'Llenado autom\u00e1tico del perfil desde el registro ERAU',
  },
  continueAsAttorney: {
    uk: 'Продовжити як адвокат',
    en: 'Continue as Attorney',
    de: 'Als Anwalt fortfahren',
    es: 'Continuar como abogado',
  },

  // ─── Step2ERAUSearch ───
  erauTitle: {
    uk: 'Знайдіть себе в ЄРАУ',
    en: 'Find yourself in ERAU',
    de: 'Finden Sie sich im ERAU',
    es: 'Encu\u00e9ntrese en el ERAU',
  },
  erauSubtitle: {
    uk: 'Пошук в Єдиному реєстрі адвокатів України для автозаповнення профілю.',
    en: 'Search the Unified Register of Attorneys of Ukraine for auto-filling your profile.',
    de: 'Suche im Einheitlichen Register der Anwalte der Ukraine zur automatischen Profilbefullung.',
    es: 'B\u00fasqueda en el Registro Unificado de Abogados de Ucrania para completar autom\u00e1ticamente su perfil.',
  },
  enterSurname: {
    uk: 'Введіть прізвище...',
    en: 'Enter surname...',
    de: 'Nachname eingeben...',
    es: 'Ingrese el apellido...',
  },
  searchButton: {
    uk: 'Шукати',
    en: 'Search',
    de: 'Suchen',
    es: 'Buscar',
  },
  searchError: {
    uk: 'Помилка пошуку. Спробуйте ще раз.',
    en: 'Search error. Please try again.',
    de: 'Suchfehler. Bitte versuchen Sie es erneut.',
    es: 'Error de b\u00fasqueda. Int\u00e9ntelo de nuevo.',
  },
  nothingFoundTryAnother: {
    uk: 'Нічого не знайдено. Спробуйте інше прізвище.',
    en: 'Nothing found. Try a different surname.',
    de: 'Nichts gefunden. Versuchen Sie einen anderen Nachnamen.',
    es: 'No se encontr\u00f3 nada. Pruebe con otro apellido.',
  },
  skipThisStep: {
    uk: 'Пропустити цей крок',
    en: 'Skip this step',
    de: 'Diesen Schritt uberspringen',
    es: 'Omitir este paso',
  },
  selectButton: {
    uk: 'Обрати',
    en: 'Select',
    de: 'Auswahlen',
    es: 'Seleccionar',
  },

  // ─── PendingInvitationsModal ───
  newRequests: {
    uk: 'Нові запити',
    en: 'New Requests',
    de: 'Neue Anfragen',
    es: 'Nuevas solicitudes',
  },
  newRequestSingular: {
    uk: 'новий запит',
    en: 'new request',
    de: 'neue Anfrage',
    es: 'nueva solicitud',
  },
  newRequestFew: {
    uk: 'нових запити',
    en: 'new requests',
    de: 'neue Anfragen',
    es: 'nuevas solicitudes',
  },
  newRequestMany: {
    uk: 'нових запитів',
    en: 'new requests',
    de: 'neue Anfragen',
    es: 'nuevas solicitudes',
  },
  declineReasonOptional: {
    uk: 'Причина відмови (необов\'язково)',
    en: 'Decline reason (optional)',
    de: 'Ablehnungsgrund (optional)',
    es: 'Motivo del rechazo (opcional)',
  },
  enterReasonPlaceholder: {
    uk: 'Вкажіть причину...',
    en: 'Enter reason...',
    de: 'Grund eingeben...',
    es: 'Indique el motivo...',
  },
  confirmDecline: {
    uk: 'Підтвердити відхилення',
    en: 'Confirm Decline',
    de: 'Ablehnung bestatigen',
    es: 'Confirmar rechazo',
  },
  verificationDocReview: {
    uk: 'Перевірка документів',
    en: 'Document Verification',
    de: 'Dokumentenprufung',
    es: 'Verificaci\u00f3n de documentos',
  },
};

/**
 * Hook: returns a t() function that resolves keys to current locale.
 * Usage: const t = useMattersT(); t('mattersTitle')
 */
export function useMattersT(): (key: string) => string {
  const locale = getLocale();
  return (key: string) => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[locale] || entry['uk'] || key;
  };
}

/**
 * Non-hook version for use outside React components.
 */
export function mattersT(key: string): string {
  const locale = getLocale();
  const entry = translations[key];
  if (!entry) return key;
  return entry[locale] || entry['uk'] || key;
}
