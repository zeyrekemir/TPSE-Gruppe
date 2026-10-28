# PEARL Robot Hub – Benutzerhandbuch

*English version: [USER_GUIDE.md](USER_GUIDE.md)*

Der Robot Hub ist der zentrale Ort für alle Roboter des PEARL Labs: Wer hat welchen Roboter wann? Ist er gerade verfügbar oder defekt? Wo liegt die Doku, und was wurde zuletzt damit gemacht?

## 1. Anmelden

1. Die Adresse des Robot Hub im Browser öffnen.
2. Vor der Anmeldung zeigt eine kurze Scroll-Story, was der Hub kann: Beim Scrollen nimmt ein Roboterarm vier Funktionsmodule vom Förderband und stellt sie aus. **Zur Anmeldung springen** (oben rechts) überspringt sie.
3. Mit Benutzername und Passwort anmelden. Ist LDAP eingerichtet, gilt dein normales Lab-/TU-Konto.

Sprache (**DE/EN**) und Darstellung lassen sich jederzeit unten in der Seitenleiste umstellen. Die Sprache wird für dein Konto gespeichert.

## 2. Roboterübersicht

Die Startseite zeigt alle Roboter als Karten. Oben stehen vier Kacheln mit der Anzahl der Roboter pro Status:

| Status | Bedeutung |
|---|---|
| 🟢 **Verfügbar** | frei und einsatzbereit |
| 🔵 **Reserviert** | gerade durch eine laufende Reservierung belegt |
| 🟡 **In Wartung** | wird gewartet; für spätere Zeiträume reservierbar |
| 🔴 **Defekt** | nicht nutzbar, kann nicht reserviert werden |
| ⚪ **Außer Betrieb** | dauerhaft stillgelegt |

- Ein Klick auf eine Kachel filtert die Liste, ein zweiter Klick hebt den Filter auf.
- Das Suchfeld durchsucht Name, Typ und Standort.
- Ein Klick auf eine Karte öffnet die Detailseite.

## 3. Detailseite eines Roboters

Hier steht alles zu einem Roboter: Typ, Standort, verantwortliche Person, Link zur Dokumentation und Beschreibung. Darunter folgen die kommenden Reservierungen, die Wartungs- und Störungsmeldungen und die Versuchsprotokolle.

Admins und die **verantwortliche Person** können den Status direkt hier ändern, zum Beispiel auf „In Wartung“.

## 4. Roboter reservieren

**Im Kalender** (Menüpunkt *Kalender*):

1. In der Wochen- oder Tagesansicht mit der Maus über den gewünschten Zeitraum ziehen.
2. Im Formular den Roboter wählen und optional einen Zweck eintragen, dann **Speichern**.

Alternativ: **Neue Reservierung** oben rechts im Kalender oder **Reservieren** auf der Detailseite.

**Wenn der Zeitraum schon belegt ist**, zeigt der Hub, mit wem es sich überschneidet, und schlägt den **nächsten freien Zeitraum** gleicher Länge vor. Ein Klick auf **Diesen Zeitraum nehmen** übernimmt den Vorschlag.

**Ändern und löschen:**
- Eigene Reservierungen im Kalender verschieben (ziehen) oder verlängern (am unteren Rand ziehen). Auch dabei wird auf Überschneidungen geprüft.
- Eine Reservierung im Kalender anklicken, um sie zu löschen.
- Über die Auswahl oben filtert der Kalender nach Roboter, mit **Nur meine** auf eigene Buchungen.

Defekte oder stillgelegte Roboter können nicht reserviert werden.

## 5. Wartung und Störungen melden

Unter *Wartung* oder auf der Detailseite eines Roboters:

1. **Art** wählen: *Störung* (etwas ist kaputt) oder *Wartung* (geplante Arbeit, z. B. Kalibrierung).
2. Titel und Beschreibung eintragen.
3. Bei Störungen kann **Roboter als defekt markieren** angehakt werden. Dann kann ihn niemand mehr reservieren, bis das Problem gelöst ist.

Jede Meldung hat einen Status: **Offen → In Bearbeitung → Erledigt**. Ein Klick auf die Meldung zeigt den Verlauf mit allen Statuswechseln und Kommentaren.

- **Kommentieren** kann jedes Mitglied.
- **Status und Zuständigkeit ändern** können Admins, die meldende Person, die zuständige Person und die verantwortliche Person des Roboters.
- Wird die **letzte offene Meldung** eines defekten oder gewarteten Roboters erledigt, ist der Roboter automatisch wieder **verfügbar**.

## 6. Versuchsprotokolle

Unter *Versuche* oder auf der Detailseite: Datum, Titel, Beschreibung und Ergebnis (*Erfolgreich*, *Teilweise*, *Fehlgeschlagen*) eintragen. So sieht man, was zuletzt mit einem Roboter gemacht wurde. Eigene Einträge kann man wieder löschen.

## 7. Darstellung anpassen

Das Regler-Symbol unten in der Seitenleiste öffnet die Einstellungen:

- **Hell / Dunkel**
- **Glas-Deckkraft**: von *Klar* (sehr durchsichtig) bis *Deckend*. Bei schwachem Kontrast den Regler nach rechts schieben.
- **Unschärfe** des Glas-Effekts
- **Bewegter Hintergrund** ein-/ausschalten
- **Willkommens-Story vor der Anmeldung zeigen** ein-/ausschalten, oder **Willkommens-Story ansehen**

Diese Einstellungen gelten nur für den aktuellen Browser.

## 8. Für Admins

**Roboter verwalten**: Auf der Übersicht **Neuer Roboter**. Auf der Detailseite stehen **Bearbeiten** und **Löschen** zur Verfügung. Beim Löschen eines Roboters werden auch seine Reservierungen, Meldungen und Protokolle gelöscht.

**Nutzer verwalten** (Menüpunkt *Nutzer*):
- Lokale Konten mit Passwort (mindestens 8 Zeichen) und Rolle anlegen.
- Rolle zwischen *Mitglied* und *Admin* wechseln, Konten deaktivieren. Deaktivierte Nutzer werden sofort abgemeldet.
- LDAP-Konten entstehen automatisch beim ersten Login. Ist eine Admin-Gruppe konfiguriert, bestimmt das Verzeichnis die Rolle bei jedem Login.
- Das eigene Konto kann man nicht herabstufen oder deaktivieren, damit immer ein Admin übrig bleibt.

## 9. Rechte im Überblick

| Aktion | Wer darf das |
|---|---|
| Roboter anlegen/löschen, Nutzer verwalten | Admin |
| Status, Standort und Beschreibung eines Roboters ändern | Admin, verantwortliche Person |
| Reservieren, Störung melden, Protokoll schreiben, kommentieren | alle Mitglieder |
| Reservierung/Protokoll ändern oder löschen | Ersteller:in, Admin |
| Status/Zuständigkeit einer Meldung ändern | Admin, meldende Person, zuständige Person, Verantwortliche:r des Roboters |

## 10. Häufige Fragen

**Ich werde plötzlich abgemeldet.** Die Anmeldung gilt 12 Stunden. Danach einfach erneut anmelden.

**Ich kann einen Roboter nicht reservieren.** Er ist vermutlich *defekt* oder *außer Betrieb*. Der Status steht auf der Karte.

**Meine Reservierung wird abgelehnt, obwohl der Kalender frei aussieht.** Ist ein Filter aktiv (Roboter oder *Nur meine*)? Dann sind andere Buchungen ausgeblendet. Die Meldung nennt die Überschneidung und schlägt einen freien Zeitraum vor.

**Die Scroll-Story stört.** Unter *Darstellung* → *Willkommens-Story vor der Anmeldung zeigen* ausschalten. Bei aktivierter Betriebssystem-Einstellung „Bewegung reduzieren“ wird es ohnehin übersprungen.
