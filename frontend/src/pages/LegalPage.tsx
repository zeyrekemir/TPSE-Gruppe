import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type LegalInfo } from '../api'
import { useAuth } from '../auth'
import { ShieldIcon } from '../icons'

/**
 * Imprint and privacy notice, public (no sign-in). The university's details are TU Darmstadt's official ones
 * (tu-darmstadt.de/impressum and /datenschutzerklaerung); the lab's contact comes from the server settings
 * (ROBOTS_LEGAL_CONTACT_*), so it can be changed without a new build. The privacy text describes exactly what
 * this application stores; keep it in step with the code.
 */
export default function LegalPage({ kind }: { kind: 'imprint' | 'privacy' | 'accessibility' }) {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const [info, setInfo] = useState<LegalInfo | null>(null)
  useEffect(() => {
    api.legal().then(setInfo).catch(() => setInfo(null))
  }, [])
  const de = i18n.language !== 'en'
  const contact = <Contact info={info} de={de} />
  const body = useRef<HTMLDivElement>(null)
  const [sections, setSections] = useState<{ id: string; title: string }[]>([])
  const [current, setCurrent] = useState('')

  // A table of contents from the page's own section headings, with the one in view highlighted.
  useEffect(() => {
    const headings = [...(body.current?.querySelectorAll('h2') ?? [])]
    headings.forEach((h, i) => (h.id = `s${i + 1}`))
    setSections(headings.map((h) => ({ id: h.id, title: h.textContent ?? '' })))
    // The current section is the last one whose heading has passed the upper third of the window.
    const onScroll = () => {
      const passed = headings.filter((h) => h.getBoundingClientRect().top < window.innerHeight * 0.3)
      setCurrent(passed.length ? passed[passed.length - 1].id : (headings[0]?.id ?? ''))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [kind, de, info])

  const titles = {
    imprint: de ? 'Impressum' : 'Imprint',
    privacy: de ? 'Datenschutz' : 'Privacy',
    accessibility: de ? 'Barrierefreiheit' : 'Accessibility',
  }

  return (
    <div className="legal-page">
      <div className="legal-layout">
        <aside className="legal-aside">
          <Link to={user ? '/robots' : '/'} className="legal-back">
            <span aria-hidden="true">←</span> {de ? 'Zurück' : 'Back'}
          </Link>
          {sections.length > 1 && (
            <nav className="legal-toc glass" aria-label={de ? 'Inhalt' : 'Contents'}>
              <span className="legal-toc-title">{de ? 'Inhalt' : 'Contents'}</span>
              <ol>
                {sections.map((sec) => (
                  <li key={sec.id}>
                    <a href={`#${sec.id}`} className={sec.id === current ? 'active' : undefined}>
                      {sec.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </aside>
        <article className="legal glass-strong">
          <p className="legal-kicker">
            <ShieldIcon />
            {de ? 'Rechtliches' : 'Legal'} · {titles[kind]} · PEARL Robot Hub
          </p>
          <div className="legal-body" ref={body}>
            {kind === 'imprint' && (de ? <ImprintDe contact={contact} /> : <ImprintEn contact={contact} />)}
            {kind === 'privacy' && (de ? <PrivacyDe contact={contact} info={info} /> : <PrivacyEn contact={contact} info={info} />)}
            {kind === 'accessibility' && (de ? <AccessibilityDe contact={contact} /> : <AccessibilityEn contact={contact} />)}
          </div>
          <LegalLinks />
        </article>
      </div>
    </div>
  )
}

/** Links to both pages, for the sign-in form and the sidebar. */
export function LegalLinks() {
  const { i18n } = useTranslation()
  const de = i18n.language !== 'en'
  return (
    <nav className="legal-links" aria-label={de ? 'Rechtliches' : 'Legal'}>
      <Link to="/impressum">{de ? 'Impressum' : 'Imprint'}</Link>
      <Link to="/datenschutz">{de ? 'Datenschutz' : 'Privacy'}</Link>
      <Link to="/barrierefreiheit">{de ? 'Barrierefreiheit' : 'Accessibility'}</Link>
    </nav>
  )
}

/** Shown to signed-in people only: saves their data as a JSON file. */
function MyDataButton({ label }: { label: string }) {
  const { user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  if (!user) return null
  return (
    <p>
      <button type="button" className="secondary" onClick={() => api.downloadMyData().catch((e: Error) => setError(e.message))}>
        {label}
      </button>
      {error && <span className="legal-missing"> {error}</span>}
    </p>
  )
}

function Contact({ info, de }: { info: LegalInfo | null; de: boolean }) {
  if (!info?.name && !info?.email) {
    return (
      <p className="legal-missing">
        {de
          ? 'Die Kontaktperson für diese Anwendung ist noch nicht eingetragen (Einstellungen ROBOTS_LEGAL_CONTACT_NAME, _EMAIL, _ADDRESS).'
          : 'The contact for this application has not been entered yet (settings ROBOTS_LEGAL_CONTACT_NAME, _EMAIL, _ADDRESS).'}
      </p>
    )
  }
  return (
    <address>
      {info.name}
      {info.address && (
        <>
          <br />
          {info.address}
        </>
      )}
      {info.email && (
        <>
          <br />
          <a href={`mailto:${info.email}`}>{info.email}</a>
        </>
      )}
    </address>
  )
}

const TU_ADDRESS = (
  <address>
    Technische Universität Darmstadt
    <br />
    Karolinenplatz 5
    <br />
    64289 Darmstadt
  </address>
)

function ImprintDe({ contact }: { contact: ReactNode }) {
  return (
    <>
      <h1>Impressum</h1>
      <h2>Anbieter</h2>
      {TU_ADDRESS}
      <p>
        Die Technische Universität Darmstadt ist eine rechtsfähige Körperschaft des öffentlichen Rechts. Sie wird
        vertreten durch die Präsidentin der Technischen Universität Darmstadt.
      </p>
      <p>Umsatzsteuer-Identifikationsnummer: DE 111 608 628</p>
      <p>Rechtsaufsicht: Hessisches Ministerium für Wissenschaft und Kunst, Rheinstr. 23–25, 65185 Wiesbaden</p>
      <h2>Verantwortlich für diese Anwendung</h2>
      <p>PEARL Robot Hub, ein Dienst des PEARL Lab an der TU Darmstadt. Ansprechpartner:</p>
      {contact}
      <p>
        Das vollständige Impressum der TU Darmstadt:{' '}
        <a href="https://www.tu-darmstadt.de/impressum/" target="_blank" rel="noreferrer">
          tu-darmstadt.de/impressum
        </a>
      </p>
    </>
  )
}

function ImprintEn({ contact }: { contact: ReactNode }) {
  return (
    <>
      <h1>Imprint</h1>
      <h2>Provider</h2>
      {TU_ADDRESS}
      <p>
        Technische Universität Darmstadt is a corporation under public law with legal capacity. It is represented by
        the President of Technische Universität Darmstadt.
      </p>
      <p>VAT ID: DE 111 608 628</p>
      <p>Supervisory authority: Hessian Ministry of Higher Education, Research and the Arts, Rheinstr. 23–25, 65185 Wiesbaden</p>
      <h2>Responsible for this application</h2>
      <p>PEARL Robot Hub, a service of the PEARL Lab at TU Darmstadt. Contact:</p>
      {contact}
      <p>
        TU Darmstadt's full imprint (German):{' '}
        <a href="https://www.tu-darmstadt.de/impressum/" target="_blank" rel="noreferrer">
          tu-darmstadt.de/impressum
        </a>
      </p>
    </>
  )
}

// Enforcement body as named in TU Darmstadt's own accessibility statement (tu-darmstadt.de/barrierefreiheit).
const ARBITRATION = (
  <address>
    Schlichtungsstelle nach dem Behindertengleichstellungsgesetz bei dem Beauftragten der Bundesregierung für die
    Belange von Menschen mit Behinderungen
    <br />
    Mauerstraße 53, 10117 Berlin
    <br />
    <a href="mailto:info@schlichtungsstelle-bgg.de">info@schlichtungsstelle-bgg.de</a>
  </address>
)

function AccessibilityDe({ contact }: { contact: ReactNode }) {
  return (
    <>
      <h1>Erklärung zur Barrierefreiheit</h1>
      <p>
        Die TU Darmstadt ist bemüht, den PEARL Robot Hub im Einklang mit der Richtlinie (EU) 2016/2102 und den
        Gleichstellungsgesetzen von Bund und Ländern barrierefrei zugänglich zu machen. Maßstab sind die Web Content
        Accessibility Guidelines (WCAG) 2.1, Stufe AA.
      </p>
      <h2>Stand der Vereinbarkeit</h2>
      <p>Diese Anwendung ist teilweise vereinbar. Bedienbar sind alle Funktionen per Tastatur; es gibt eine
        Sprungmarke zum Inhalt, sichtbare Fokusrahmen, beschriftete Bedienelemente, ausreichende Kontraste
        (mindestens 4,5:1) in hellem und dunklem Design, und Animationen entfallen, wenn das Betriebssystem
        „Bewegung reduzieren“ meldet.</p>
      <h2>Nicht barrierefreie Inhalte</h2>
      <ul>
        <li>
          Die 3D-Animation vor der Anmeldung ist für Screenreader ausgeblendet; was sie zeigt, steht in den Texten
          daneben. Sie lässt sich mit „Zur Anmeldung springen“ überspringen und in den Darstellungseinstellungen abschalten.
        </li>
        <li>
          Im Kalender lassen sich Buchungen per Maus ziehen; dieselben Buchungen gelingen über das Formular, auch per
          Tastatur.
        </li>
        <li>Die Diagramme der Statistikseite haben noch keine vollständige Textalternative.</li>
        <li>
          Sehr hohe Transparenz der Glasflächen (einstellbar unter „Darstellung“) kann den Kontrast verringern; die
          Voreinstellung erfüllt die Anforderungen.
        </li>
      </ul>
      <h2>Erstellung dieser Erklärung</h2>
      <p>
        Erstellt am 28.10.2026 auf Grundlage einer Selbstbewertung (Prüfung des Codes, berechnete Kontraste,
        Tastaturbedienung). Ein Test durch Menschen mit Behinderungen steht noch aus.
      </p>
      <h2>Barrieren melden</h2>
      <p>Wenn Ihnen Barrieren auffallen, wenden Sie sich bitte an:</p>
      {contact}
      <h2>Durchsetzungsverfahren</h2>
      <p>Erhalten Sie auf eine Meldung keine zufriedenstellende Antwort, können Sie sich wenden an die</p>
      {ARBITRATION}
    </>
  )
}

function AccessibilityEn({ contact }: { contact: ReactNode }) {
  return (
    <>
      <h1>Accessibility statement</h1>
      <p>
        TU Darmstadt strives to make the PEARL Robot Hub accessible in line with Directive (EU) 2016/2102 and the German
        federal and state equality laws. The standard is the Web Content Accessibility Guidelines (WCAG) 2.1, level AA.
      </p>
      <h2>Compliance status</h2>
      <p>This application is partially compliant. Every function works with the keyboard; there is a skip link to the
        content, visible focus outlines, labelled controls, sufficient contrast (at least 4.5:1) in the light and dark
        design, and animations stop when the operating system asks for reduced motion.</p>
      <h2>Content that is not accessible</h2>
      <ul>
        <li>
          The 3D animation before sign-in is hidden from screen readers; what it shows is in the texts next to it. It
          can be skipped with "Skip to sign-in" and switched off in the appearance settings.
        </li>
        <li>Bookings can be dragged in the calendar with the mouse; the same bookings can be made with the form, also by keyboard.</li>
        <li>The charts on the statistics page do not yet have a complete text alternative.</li>
        <li>
          Very high transparency of the glass panels (adjustable under "Appearance") can reduce contrast; the default
          meets the requirements.
        </li>
      </ul>
      <h2>Preparation of this statement</h2>
      <p>
        Prepared on 28 October 2026 based on a self-assessment (code review, calculated contrast, keyboard use). A test
        by people with disabilities is still to come.
      </p>
      <h2>Report a barrier</h2>
      <p>If you come across a barrier, please contact:</p>
      {contact}
      <h2>Enforcement procedure</h2>
      <p>If you do not receive a satisfactory answer to your report, you can turn to the (German-language)</p>
      {ARBITRATION}
    </>
  )
}

function PrivacyDe({ contact, info }: { contact: ReactNode; info: LegalInfo | null }) {
  return (
    <>
      <h1>Datenschutzerklärung</h1>
      <p>Diese Erklärung gilt für den PEARL Robot Hub und informiert nach Art. 13 DSGVO, welche Daten er verarbeitet.</p>
      <h2>Verantwortlicher</h2>
      {TU_ADDRESS}
      <p>Ansprechpartner für diese Anwendung:</p>
      {contact}
      <p>
        Behördlicher Datenschutzbeauftragter der TU Darmstadt: Karolinenplatz 5, 64289 Darmstadt,{' '}
        <a href="https://www.tu-darmstadt.de/datenschutz/" target="_blank" rel="noreferrer">
          tu-darmstadt.de/datenschutz
        </a>
      </p>
      <h2>Welche Daten und wozu</h2>
      <ul>
        <li>
          <strong>Konto:</strong> Benutzername (bei Anmeldung mit TU-ID die TU-ID), Name, E-Mail-Adresse, Rolle und
          Sprache. Lokale Passwörter werden nur als Hash gespeichert.
        </li>
        <li>
          <strong>Reservierungen, Wartungs- und Störungsmeldungen, Versuchsprotokolle:</strong> wer wann welchen Roboter
          nutzt oder was gemeldet bzw. protokolliert hat, für die Organisation des Labors und die Nachvollziehbarkeit.
        </li>
        <li>
          <strong>Benachrichtigungen:</strong> E-Mails über den Mailserver der TU an die eigene Adresse
          (Störungen, Statusänderungen, Erinnerungen).
          {info?.discord &&
            ' Zusätzlich gehen kurze Meldungen ohne Personennamen (Roboter und Titel der Meldung) in einen Discord-Kanal des Labors; Discord ist ein Dienst der Discord Inc. (USA).'}
        </li>
        <li>
          <strong>Anmeldeschutz:</strong> Nach mehreren falschen Passwörtern merkt sich der Server Benutzername und
          IP-Adresse höchstens 15 Minuten lang im Arbeitsspeicher, um Rateversuche zu bremsen.
        </li>
        <li>
          <strong>Server-Protokolle:</strong> Beim Aufruf verarbeitet der Webserver technisch notwendig IP-Adresse,
          Zeitpunkt und aufgerufene Adresse, für den Betrieb und die Fehlersuche.
        </li>
      </ul>
      <h2>Anmeldung mit TU-ID</h2>
      <p>
        Bei der Anmeldung mit TU-ID übermittelt das Hochschulrechenzentrum (HRZ) der TU Darmstadt TU-ID, Name und
        E-Mail-Adresse an diese Anwendung. Das Passwort sieht die Anwendung dabei nicht.
      </p>
      <h2>Im Browser gespeichert</h2>
      <p>
        Das Anmelde-Token (gültig 12 Stunden) sowie Sprache und Darstellungseinstellungen liegen im lokalen Speicher
        Ihres Browsers. Während einer TU-ID-Anmeldung setzt die Anwendung ein technisch notwendiges Cookie für höchstens
        10 Minuten. Es gibt keine Analyse- oder Werbe-Cookies und kein Tracking.
      </p>
      <h2>Keine externen Inhalte</h2>
      <p>
        Schriften, Grafiken und das 3D-Modell liefert dieser Server selbst aus; beim Aufruf der Seiten werden keine
        Dienste Dritter kontaktiert.
      </p>
      <h2>Rechtsgrundlage und Speicherdauer</h2>
      <p>
        Die Verarbeitung dient der Erfüllung der Aufgaben der Universität in Forschung und Lehre (Art. 6 Abs. 1 lit. e
        DSGVO in Verbindung mit § 3 HDSIG). Konten bestehen, bis ein Administrator sie deaktiviert oder löscht;
        Reservierungen, Meldungen und Protokolle werden als Laborunterlagen aufbewahrt, solange das Labor sie benötigt.
      </p>
      <h2>Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Widerspruch
        (Art. 15–21 DSGVO). Wenden Sie sich dazu an die oben genannte Kontaktperson. Beschwerden richten Sie an den
        Hessischen Beauftragten für Datenschutz und Informationsfreiheit, Postfach 3163, 65021 Wiesbaden.
      </p>
      <p>
        Eine Kopie aller über Sie gespeicherten Daten können Sie nach der Anmeldung selbst herunterladen. Auf Ihren
        Wunsch löscht ein Administrator Ihr Konto: Name, E-Mail und Zugang werden entfernt, künftige Buchungen
        storniert; vergangene Buchungen, Meldungen und Protokolle bleiben ohne Namen als Laborunterlagen erhalten.
      </p>
      <MyDataButton label="Meine Daten herunterladen" />
      <p>
        Allgemeine Datenschutzerklärung der TU Darmstadt:{' '}
        <a href="https://www.tu-darmstadt.de/datenschutzerklaerung" target="_blank" rel="noreferrer">
          tu-darmstadt.de/datenschutzerklaerung
        </a>
      </p>
    </>
  )
}

function PrivacyEn({ contact, info }: { contact: ReactNode; info: LegalInfo | null }) {
  return (
    <>
      <h1>Privacy notice</h1>
      <p>This notice applies to the PEARL Robot Hub and explains, as required by Art. 13 GDPR, which data it processes.</p>
      <h2>Controller</h2>
      {TU_ADDRESS}
      <p>Contact for this application:</p>
      {contact}
      <p>
        TU Darmstadt's data protection officer: Karolinenplatz 5, 64289 Darmstadt,{' '}
        <a href="https://www.tu-darmstadt.de/datenschutz/" target="_blank" rel="noreferrer">
          tu-darmstadt.de/datenschutz
        </a>
      </p>
      <h2>Which data, and why</h2>
      <ul>
        <li>
          <strong>Account:</strong> username (your TU-ID when you sign in with TU-ID), name, e-mail address, role and
          language. Local passwords are stored only as a hash.
        </li>
        <li>
          <strong>Reservations, maintenance and fault reports, experiment logs:</strong> who uses which robot when, and
          what was reported or logged, to organise the lab and keep a record.
        </li>
        <li>
          <strong>Notifications:</strong> e-mails through TU's mail server to your own address (faults, status changes,
          reminders).
          {info?.discord &&
            " Short messages without people's names (robot and report title) also go to the lab's Discord channel; Discord is a service of Discord Inc. (USA)."}
        </li>
        <li>
          <strong>Sign-in protection:</strong> after several wrong passwords the server keeps the username and IP address
          in memory for at most 15 minutes to slow down guessing.
        </li>
        <li>
          <strong>Server logs:</strong> to deliver the pages the web server processes your IP address, the time and the
          address requested, for operation and troubleshooting.
        </li>
      </ul>
      <h2>Sign-in with TU-ID</h2>
      <p>
        When you sign in with TU-ID, TU Darmstadt's computing centre (HRZ) passes your TU-ID, name and e-mail address to
        this application. The application never sees your password.
      </p>
      <h2>Stored in your browser</h2>
      <p>
        The sign-in token (valid for 12 hours), your language and appearance settings are kept in your browser's local
        storage. During a TU-ID sign-in the application sets one technically necessary cookie for at most 10 minutes.
        There are no analytics or advertising cookies and no tracking.
      </p>
      <h2>No outside content</h2>
      <p>
        Fonts, graphics and the 3D model are delivered by this server itself; opening the pages contacts no third
        party.
      </p>
      <h2>Legal basis and retention</h2>
      <p>
        Processing serves the university's tasks in research and teaching (Art. 6(1)(e) GDPR with § 3 HDSIG). Accounts
        exist until an administrator deactivates or deletes them; reservations, reports and logs are kept as lab records
        for as long as the lab needs them.
      </p>
      <h2>Your rights</h2>
      <p>
        You have the right of access, rectification, erasure, restriction of processing and objection (Art. 15–21
        GDPR); contact the person named above. Complaints go to the Hessian Commissioner for Data Protection and Freedom
        of Information, Postfach 3163, 65021 Wiesbaden.
      </p>
      <p>
        Once signed in you can download a copy of everything stored about you yourself. On request an administrator
        erases your account: name, e-mail and sign-in are removed, future bookings cancelled; past bookings, reports and
        logs stay as lab records without your name.
      </p>
      <MyDataButton label="Download my data" />
      <p>
        TU Darmstadt's general privacy notice (German):{' '}
        <a href="https://www.tu-darmstadt.de/datenschutzerklaerung" target="_blank" rel="noreferrer">
          tu-darmstadt.de/datenschutzerklaerung
        </a>
      </p>
    </>
  )
}
