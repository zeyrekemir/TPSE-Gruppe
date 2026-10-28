import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const en = {
  app: { title: 'PEARL Robot Platform' },
  nav: { robots: 'Robots', calendar: 'Calendar', tickets: 'Maintenance', logs: 'Experiments', stats: 'Statistics', users: 'Users', logout: 'Log out' },
  common: {
    save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', add: 'Add', loading: 'Loading…',
    none: '—', confirmDelete: 'Really delete?', all: 'All', name: 'Name', actions: 'Actions',
  },
  login: { tagline: 'Every robot in the lab, one place: who has it, what state it is in, what was tried.', sso: 'Sign in with {{label}}', tuidHeading: 'Sign in with {{label}}:', ssoNotConfigured: 'Available once the lab has registered the app with TU single sign-on.', or: 'or with username', ssoError: 'Single sign-on failed ({{reason}}). Please try again.', ssoUnreachable: 'The {{label}} sign-in server is not reachable right now. Please try again later or sign in with your username.', title: 'Sign in', username: 'Username', password: 'Password', submit: 'Sign in', failed: 'Wrong username or password', tooMany: 'Too many wrong passwords for this account. Please wait a few minutes and try again.' },
  status: {
    available: 'Available', reserved: 'Reserved', maintenance: 'In maintenance', defect: 'Defect', retired: 'Retired',
  },
  robot: {
    new: 'New robot', type: 'Type', location: 'Location', responsible: 'Responsible', documentation: 'Documentation',
    description: 'Description', status: 'Status', openTickets: 'Open tickets', reserve: 'Reserve',
    upcoming: 'Upcoming reservations', noRobots: 'No robots yet.',
  },
  reservation: {
    new: 'New reservation', robot: 'Robot', start: 'Start', end: 'End', purpose: 'Purpose', by: 'By',
    conflict: 'This slot is already taken.', conflictsWith: 'Conflicts with', suggestion: 'Next free slot',
    useSuggestion: 'Use this slot', mine: 'Only mine', selectHint: 'Drag across the calendar to reserve a robot.',
    pickRobot: 'Pick a robot first.',
  },
  ticket: {
    new: 'Report issue', kind: 'Kind', title: 'Title', status: 'Status', reporter: 'Reported by', assignee: 'Assignee',
    history: 'History', comment: 'Comment', addComment: 'Add comment', markDefect: 'Mark robot as defect',
    openOnly: 'Open only', created: 'Created', noTickets: 'No tickets.',
    kinds: { maintenance: 'Maintenance', fault: 'Fault' },
    statuses: { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' },
    changed: 'changed status from {{from}} to {{to}}', opened: 'opened the ticket',
  },
  log: {
    new: 'New experiment log', date: 'Date', title: 'Title', description: 'Description', result: 'Result',
    person: 'Person', noLogs: 'No experiments logged.',
    results: { success: 'Success', partial: 'Partial', failure: 'Failure' },
  },
  live: {
    title: 'Live status', online: 'Online', offline: 'Offline', lastSeen: 'Last report', battery: 'Battery',
    noKey: 'This robot does not report its status yet.', createKey: 'Create key', newKey: 'New key',
    revoke: 'Revoke key', keyOnce: 'Copy this key now. It is shown only once.',
    agentHint: 'Run on the robot PC:', confirmNewKey: 'The old key stops working. Continue?',
  },
  stats: {
    period: 'Period', days: '{{n}} days', bookedHours: 'Booked hours', reservations: 'Reservations',
    faults: 'Faults reported', mttr: 'Avg. time to resolve', success: 'Experiment success',
    utilization: 'Utilisation by robot', utilizationHint: 'Share of lab hours (Mon–Fri 08–18) the robot was booked',
    daily: 'Booked hours per day', heatmap: 'When the lab is busy', heatmapHint: 'Booked hours by weekday and hour',
    topUsers: 'Most active users', hours: 'h', none: 'No data in this period.', showTable: 'Show as table',
    weekdays: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
  },
  labels: {
    print: 'Print QR labels', printOne: 'QR label', hint: 'Stick on the robot. Scanning opens its page.',
    printNow: 'Print', scan: 'Scan for status, booking & issues',
  },
  story: {
    title1: 'Every robot.', title2: 'One place.', scroll: 'Scroll', skip: 'Skip to sign-in',
    f1: { title: 'Inventory', text: 'Franka, xArm, Tiago: location, responsible person and docs at a glance.' },
    f2: { title: 'Live status', text: 'See instantly which robot is free, booked, in maintenance or online.' },
    f3: { title: 'Booking without clashes', text: 'Drag a slot in the calendar. If it is taken, the hub suggests the next free one.' },
    f4: { title: 'Maintenance & logs', text: 'Report faults, follow their history, document every experiment.' },
    cta: 'Ready for the next experiment?', enter: 'Open the hub',
  },
  appearance: {
    title: 'Appearance', theme: 'Theme', light: 'Light', dark: 'Dark', opacity: 'Glass opacity', clear: 'Clear',
    solid: 'Solid', blur: 'Blur', intro: 'Show welcome story before sign-in', motion: 'Animated background', replay: 'Watch welcome story', reset: 'Reset', skip: 'Click to skip',
  },
  user: {
    new: 'New user', username: 'Username', displayName: 'Display name', email: 'E-mail', role: 'Role',
    password: 'Password', source: 'Source', active: 'Active', roles: { admin: 'Admin', member: 'Member' },
  },
}

type Dict = typeof en

const de: Dict = {
  app: { title: 'PEARL Roboter-Plattform' },
  nav: { robots: 'Roboter', calendar: 'Kalender', tickets: 'Wartung', logs: 'Versuche', stats: 'Statistik', users: 'Nutzer', logout: 'Abmelden' },
  common: {
    save: 'Speichern', cancel: 'Abbrechen', delete: 'Löschen', edit: 'Bearbeiten', add: 'Hinzufügen', loading: 'Lädt…',
    none: '—', confirmDelete: 'Wirklich löschen?', all: 'Alle', name: 'Name', actions: 'Aktionen',
  },
  login: { tagline: 'Alle Roboter des Labs an einem Ort: wer ihn hat, in welchem Zustand er ist, was versucht wurde.', sso: 'Mit {{label}} anmelden', tuidHeading: 'Zum Login mit {{label}}:', ssoNotConfigured: 'Verfügbar, sobald das Lab die App für das TU-Single-Sign-on registriert hat.', or: 'oder mit Benutzername', ssoError: 'Anmeldung über SSO fehlgeschlagen ({{reason}}). Bitte erneut versuchen.', ssoUnreachable: 'Der {{label}}-Anmeldeserver ist gerade nicht erreichbar. Bitte später erneut versuchen oder mit Benutzername anmelden.', title: 'Anmelden', username: 'Benutzername', password: 'Passwort', submit: 'Anmelden', failed: 'Benutzername oder Passwort falsch', tooMany: 'Zu viele falsche Passwörter für dieses Konto. Bitte ein paar Minuten warten und erneut versuchen.' },
  status: {
    available: 'Verfügbar', reserved: 'Reserviert', maintenance: 'In Wartung', defect: 'Defekt', retired: 'Außer Betrieb',
  },
  robot: {
    new: 'Neuer Roboter', type: 'Typ', location: 'Standort', responsible: 'Verantwortlich', documentation: 'Dokumentation',
    description: 'Beschreibung', status: 'Status', openTickets: 'Offene Meldungen', reserve: 'Reservieren',
    upcoming: 'Kommende Reservierungen', noRobots: 'Noch keine Roboter.',
  },
  reservation: {
    new: 'Neue Reservierung', robot: 'Roboter', start: 'Beginn', end: 'Ende', purpose: 'Zweck', by: 'Von',
    conflict: 'Dieser Zeitraum ist bereits belegt.', conflictsWith: 'Überschneidet sich mit', suggestion: 'Nächster freier Zeitraum',
    useSuggestion: 'Diesen Zeitraum nehmen', mine: 'Nur meine', selectHint: 'Im Kalender einen Zeitraum ziehen, um zu reservieren.',
    pickRobot: 'Bitte zuerst einen Roboter wählen.',
  },
  ticket: {
    new: 'Problem melden', kind: 'Art', title: 'Titel', status: 'Status', reporter: 'Gemeldet von', assignee: 'Zuständig',
    history: 'Verlauf', comment: 'Kommentar', addComment: 'Kommentar hinzufügen', markDefect: 'Roboter als defekt markieren',
    openOnly: 'Nur offene', created: 'Erstellt', noTickets: 'Keine Meldungen.',
    kinds: { maintenance: 'Wartung', fault: 'Störung' },
    statuses: { open: 'Offen', in_progress: 'In Bearbeitung', resolved: 'Erledigt' },
    changed: 'hat den Status von {{from}} auf {{to}} geändert', opened: 'hat die Meldung erstellt',
  },
  log: {
    new: 'Neues Versuchsprotokoll', date: 'Datum', title: 'Titel', description: 'Beschreibung', result: 'Ergebnis',
    person: 'Person', noLogs: 'Keine Versuche protokolliert.',
    results: { success: 'Erfolgreich', partial: 'Teilweise', failure: 'Fehlgeschlagen' },
  },
  live: {
    title: 'Live-Status', online: 'Online', offline: 'Offline', lastSeen: 'Letzte Meldung', battery: 'Akku',
    noKey: 'Dieser Roboter meldet seinen Status noch nicht.', createKey: 'Schlüssel erstellen', newKey: 'Neuer Schlüssel',
    revoke: 'Schlüssel widerrufen', keyOnce: 'Diesen Schlüssel jetzt kopieren. Er wird nur einmal angezeigt.',
    agentHint: 'Auf dem Roboter-PC ausführen:', confirmNewKey: 'Der alte Schlüssel wird ungültig. Fortfahren?',
  },
  stats: {
    period: 'Zeitraum', days: '{{n}} Tage', bookedHours: 'Gebuchte Stunden', reservations: 'Reservierungen',
    faults: 'Gemeldete Störungen', mttr: 'Ø Zeit bis zur Lösung', success: 'Erfolgreiche Versuche',
    utilization: 'Auslastung pro Roboter', utilizationHint: 'Anteil der Laborzeit (Mo–Fr 08–18), in der der Roboter gebucht war',
    daily: 'Gebuchte Stunden pro Tag', heatmap: 'Wann das Labor voll ist', heatmapHint: 'Gebuchte Stunden nach Wochentag und Uhrzeit',
    topUsers: 'Aktivste Nutzer', hours: 'Std.', none: 'Keine Daten in diesem Zeitraum.', showTable: 'Als Tabelle zeigen',
    weekdays: 'Mo,Di,Mi,Do,Fr,Sa,So',
  },
  labels: {
    print: 'QR-Etiketten drucken', printOne: 'QR-Etikett', hint: 'Auf den Roboter kleben. Scannen öffnet seine Seite.',
    printNow: 'Drucken', scan: 'Scannen für Status, Buchung & Störungen',
  },
  story: {
    title1: 'Jeder Roboter.', title2: 'Ein Ort.', scroll: 'Scrollen', skip: 'Zur Anmeldung springen',
    f1: { title: 'Inventar', text: 'Franka, xArm, Tiago: Standort, Verantwortliche und Doku auf einen Blick.' },
    f2: { title: 'Live-Status', text: 'Sofort sehen, welcher Roboter frei, gebucht, in Wartung oder online ist.' },
    f3: { title: 'Buchen ohne Konflikte', text: 'Zeitraum im Kalender ziehen. Ist er belegt, schlägt der Hub die nächste freie Lücke vor.' },
    f4: { title: 'Wartung & Protokolle', text: 'Störungen melden, Verlauf verfolgen, jeden Versuch dokumentieren.' },
    cta: 'Bereit für den nächsten Versuch?', enter: 'Zum Hub',
  },
  appearance: {
    title: 'Darstellung', theme: 'Design', light: 'Hell', dark: 'Dunkel', opacity: 'Glas-Deckkraft', clear: 'Klar',
    solid: 'Deckend', blur: 'Unschärfe', intro: 'Willkommens-Story vor der Anmeldung zeigen', motion: 'Bewegter Hintergrund', replay: 'Willkommens-Story ansehen', reset: 'Zurücksetzen', skip: 'Klicken zum Überspringen',
  },
  user: {
    new: 'Neuer Nutzer', username: 'Benutzername', displayName: 'Anzeigename', email: 'E-Mail', role: 'Rolle',
    password: 'Passwort', source: 'Quelle', active: 'Aktiv', roles: { admin: 'Admin', member: 'Mitglied' },
  },
}

function initialLanguage() {
  try {
    const saved = localStorage.getItem('robots.lang')
    if (saved === 'de' || saved === 'en') return saved
  } catch {
    /* ignore */
  }
  return navigator.language.startsWith('de') ? 'de' : 'en'
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  try {
    localStorage.setItem('robots.lang', lng)
  } catch {
    /* ignore */
  }
})

export default i18n
