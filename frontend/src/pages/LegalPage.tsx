import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type LegalInfo } from '../api'
import { useAuth } from '../auth'

/**
 * Imprint and privacy notice, public (no sign-in). The university's details are TU Darmstadt's official ones
 * (tu-darmstadt.de/impressum and /datenschutzerklaerung); the lab's contact comes from the server settings
 * (ROBOTS_LEGAL_CONTACT_*), so it can be changed without a new build. The privacy text describes exactly what
 * this application stores; keep it in step with the code.
 */
export default function LegalPage({ kind }: { kind: 'imprint' | 'privacy' }) {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const [info, setInfo] = useState<LegalInfo | null>(null)
  useEffect(() => {
    api.legal().then(setInfo).catch(() => setInfo(null))
  }, [])
  const de = i18n.language !== 'en'
  const contact = <Contact info={info} de={de} />

  return (
    <div className="legal-page">
      <article className="legal glass-strong">
        <Link to={user ? '/robots' : '/'} className="legal-back">
          {de ? '← Zurück' : '← Back'}
        </Link>
        {kind === 'imprint' ? (de ? <ImprintDe contact={contact} /> : <ImprintEn contact={contact} />) : de ? (
          <PrivacyDe contact={contact} info={info} />
        ) : (
          <PrivacyEn contact={contact} info={info} />
        )}
        <LegalLinks />
      </article>
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
    </nav>
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
      <h2>Schriften</h2>
      <p>
        Die Schriftarten werden derzeit von Google Fonts (Google Ireland Ltd.) geladen; dabei erhält Google Ihre
        IP-Adresse.
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
      <h2>Fonts</h2>
      <p>The fonts are currently loaded from Google Fonts (Google Ireland Ltd.), which receives your IP address.</p>
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
        TU Darmstadt's general privacy notice (German):{' '}
        <a href="https://www.tu-darmstadt.de/datenschutzerklaerung" target="_blank" rel="noreferrer">
          tu-darmstadt.de/datenschutzerklaerung
        </a>
      </p>
    </>
  )
}
