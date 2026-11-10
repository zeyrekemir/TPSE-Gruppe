# PEARL Robot Hub – Benutzerhandbuch

*English version: [USER_GUIDE.md](USER_GUIDE.md)*

Der Robot Hub ist der zentrale Ort für alle Roboter des PEARL Labs: Wer hat welchen Roboter wann? Ist er gerade verfügbar oder defekt? Wo liegt die Doku, und was wurde zuletzt damit gemacht?

## 1. Anmelden

1. Die Adresse des Robot Hub im Browser öffnen.
2. Vor der Anmeldung zeigt eine kurze Scroll-Story, was der Hub kann: Beim Scrollen wird eine Franka Research 3 Gelenk für Gelenk zusammengebaut, und zu jeder Baustufe wird eine Funktion des Hubs vorgestellt. **Zur Anmeldung springen** (oben rechts) überspringt sie.
3. Mit **TU-ID** anmelden (Schaltfläche über dem Formular) oder mit Benutzername und Passwort. Ist LDAP eingerichtet, funktioniert auch dein normales Lab-/TU-Konto.

Nach 5 falschen Passwörtern in Folge ist das Konto für einige Minuten gesperrt. Kurz warten und dann erneut versuchen.

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

Hier steht alles zu einem Roboter: Typ, Standort, verantwortliche Person, Link zur Dokumentation, die **Spezifikation** (Firmware und Betriebssystem), die **Ausstattung** (Greifer, Kameras, Sensoren, …), eine Beschreibung und **Zuletzt genutzt von**: wer den Roboter zuletzt hatte, und wann. Darunter folgen die kommenden Reservierungen, die Wartungs- und Störungsmeldungen und die Versuchsprotokolle.

Admins und die **verantwortliche Person** können den Status direkt hier ändern, zum Beispiel auf „In Wartung“. Mit **Bearbeiten** hält die verantwortliche Person auch Standort, Beschreibung, Firmware, Betriebssystem und Ausstattung aktuell (ein Teil der Ausstattung pro Zeile).

## 4. Roboter reservieren

**Im Kalender** (Menüpunkt *Kalender*):

1. In der Wochen- oder Tagesansicht mit der Maus über den gewünschten Zeitraum ziehen.
2. Im Formular den Roboter wählen und optional einen Zweck eintragen, dann **Speichern**.

Alternativ: **Neue Reservierung** oben rechts im Kalender oder **Reservieren** auf der Detailseite.

**Wenn der Zeitraum schon belegt ist**, zeigt der Hub, mit wem es sich überschneidet, und schlägt den **nächsten freien Zeitraum** gleicher Länge vor. Ein Klick auf **Diesen Zeitraum nehmen** übernimmt den Vorschlag.

**Mitarbeitende vor Studierenden:** Mitglieder sind entweder *Studierende* oder *Mitarbeitende* (legt ein Admin fest). Brauchen Mitarbeitende einen Zeitraum, den nur Studierende gebucht haben, bietet der Hub **Diese Buchungen ersetzen** an. Die Buchungen der Studierenden werden dann storniert, und sie werden per E-Mail informiert. Wer im Kalender eine Buchung auf einen solchen Zeitraum verschiebt, wird vorher gefragt. Admins können alle Buchungen ersetzen außer denen anderer Admins. Studierende können keine Buchungen ersetzen, Mitarbeitende keine von anderen Mitarbeitenden.

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

Unter *Versuche* oder auf der Detailseite: Datum, Titel, Beschreibung, den **Ablauf** (Schritt für Schritt: Aufbau, Parameter, was ausgeführt wurde) und Ergebnis (*Erfolgreich*, *Teilweise*, *Fehlgeschlagen*) eintragen. So sieht man, was zuletzt mit einem Roboter gemacht wurde.

**Dateien**: Mit **Dateien wählen** hängst du Plots, Videos oder Konfigurationen an den Eintrag, bis zu 10 Dateien mit je 10 MB. Später fügt **+ Datei hinzufügen** unter einem Eintrag weitere hinzu. Alle können die Dateien herunterladen; wer den Eintrag geschrieben hat und Admins können sie entfernen. Eigene Einträge kann man wieder löschen, samt ihren Dateien.

## 7. Live-Status

Roboter, die sich melden, zeigen auf ihrer Detailseite einen Kasten **Live-Status**: **Online** oder **Offline**, die Zeit der **letzten Meldung**, den **Akku**-Stand (falls der Roboter einen hat) und eine kurze Nachricht. Die Seite aktualisiert ihn alle 10 Sekunden. Ein Roboter gilt als offline, wenn er sich eine Weile nicht gemeldet hat (standardmäßig 90 Sekunden).

Die Meldungen schickt ein kleines Programm auf dem PC des Roboters (`tools/robot_agent.py`), standardmäßig alle 30 Sekunden. Jeder Roboter hat einen eigenen Schlüssel:

1. Ein Admin öffnet die Detailseite des Roboters und klickt im Kasten *Live-Status* auf **Schlüssel erstellen**.
2. Der Schlüssel wird **nur einmal** angezeigt. Ihn zusammen mit dem darunter angezeigten Befehl kopieren.
3. Diesen Befehl auf dem PC des Roboters ausführen.

**Neuer Schlüssel** ersetzt den Schlüssel (der alte wird sofort ungültig), **Schlüssel widerrufen** schaltet die Meldungen ab. Ein Roboter ohne Schlüssel zeigt „Dieser Roboter meldet seinen Status noch nicht.“

## 8. Statistik

Der Menüpunkt *Statistik* zeigt, wie das Labor genutzt wird. Oben den **Zeitraum** wählen: 7, 30, 90 oder 365 Tage.

- **Kacheln**: gebuchte Stunden, Anzahl der Reservierungen, gemeldete Störungen, durchschnittliche Zeit bis zur Lösung einer Störung, der Anteil erfolgreicher Versuche und die **Verfügbarkeit**: der Anteil der Zeit, in der die Roboter in Betrieb waren, mit den Stunden außer Betrieb.
- **Auslastung pro Roboter**: der Anteil der Laborzeit (Mo–Fr 08–18), in der jeder Roboter gebucht war.
- **Gebuchte Stunden pro Tag** über den Zeitraum.
- **Wann das Labor voll ist**: gebuchte Stunden nach Wochentag und Uhrzeit. Je kräftiger das Blau, desto voller ist das Labor. So findet man leicht ruhige Zeiten.
- **Betriebs- und Ausfallzeit pro Roboter**: Stunden in Betrieb (verfügbar) und außer Betrieb (Wartung oder defekt). Jeder Statuswechsel wird gespeichert, die Werte füllen sich also mit der Zeit.
- **Wer die Roboter bucht**: der Anteil der gebuchten Stunden von Studierenden, Mitarbeitenden und Admins.
- **Aktivste Nutzer** nach gebuchten Stunden.

**Als Tabelle zeigen** neben *Gebuchte Stunden pro Tag* zeigt diese Zahlen als Tabelle, etwa für Screenreader oder zum Kopieren.

## 9. QR-Etiketten

Jeder Roboter kann ein gedrucktes Etikett mit QR-Code bekommen. Wer es mit dem Handy scannt, landet auf der Detailseite des Roboters mit Status, Buchungen und Meldungen.

- **Ein Etikett**: **QR-Etikett** auf der Detailseite, dann **Drucken**.
- **Alle Roboter auf einmal** (Admins): **QR-Etiketten drucken** auf der Übersicht, dann **Drucken**.

Das Etikett gut sichtbar auf den Roboter kleben.

## 10. TV-Anzeige

**TV-Anzeige** auf der Übersicht öffnet eine Vollbild-Anzeige für einen Bildschirm im Labor. Jeder Roboter ist eine große Kachel mit Status, **wer ihn gerade hat** (und bis wann), **wer heute als Nächstes dran ist**, Live-Status und offenen Meldungen. Oben stehen die Uhrzeit und wie viele Roboter frei, in Benutzung oder außer Betrieb sind. Die Anzeige aktualisiert sich alle 15 Sekunden von selbst und funktioniert auch auf dem Handy. Einmal im Browser des Fernsehers anmelden und die Seite offen lassen. **Anzeige verlassen** führt zurück zum Hub.

## 11. Darstellung anpassen

Das Regler-Symbol unten in der Seitenleiste öffnet die Einstellungen:

- **Hell / Dunkel**
- **Glas-Deckkraft**: von *Klar* (sehr durchsichtig) bis *Deckend*. Bei schwachem Kontrast den Regler nach rechts schieben.
- **Unschärfe** des Glas-Effekts
- **Ton**: kurze Klänge bei Klicks, Erfolg und Fehlern, ein-/ausschalten
- **Bewegte Überschriften**: sanft bewegte Überschriften, ein-/ausschalten
- **Willkommens-Story vor der Anmeldung zeigen** ein-/ausschalten, oder **Willkommens-Story ansehen**

Diese Einstellungen gelten nur für den aktuellen Browser.

## 12. Deine Daten und die rechtlichen Seiten

Die Links unten in der Seitenleiste öffnen **Impressum**, **Datenschutzerklärung** und **Erklärung zur Barrierefreiheit**. Sie sind auch ohne Anmeldung erreichbar.

Auf der Datenschutzseite kannst du **deine Daten herunterladen**: eine JSON-Datei mit allem, was der Hub über dich speichert. Soll dein Konto gelöscht werden, wende dich an einen Admin. Name, E-Mail und Anmeldung werden dann endgültig entfernt, und deine künftigen Buchungen werden storniert. Vergangene Buchungen, Meldungen und Protokolle bleiben als Lab-Unterlagen erhalten, ohne deinen Namen.

## 13. Für Admins

**Roboter verwalten**: Auf der Übersicht **Neuer Roboter**. Auf der Detailseite stehen **Bearbeiten** und **Löschen** zur Verfügung. Beim Löschen eines Roboters werden auch seine Reservierungen, Meldungen und Protokolle gelöscht.

**Nutzer verwalten** (Menüpunkt *Nutzer*):
- Lokale Konten mit Passwort (mindestens 8 Zeichen) und Rolle anlegen.
- Rolle zwischen *Mitglied* und *Admin* wechseln, Konten deaktivieren. Deaktivierte Nutzer werden sofort abgemeldet.
- LDAP-Konten entstehen automatisch beim ersten Login. Ist eine Admin-Gruppe konfiguriert, bestimmt das Verzeichnis die Rolle bei jedem Login.
- Das eigene Konto kann man nicht herabstufen oder deaktivieren, damit immer ein Admin übrig bleibt.
- **Gruppe**: Unter der Rolle festlegen, ob eine Person *Studierende:r* oder *Mitarbeitende:r* ist. Neue Personen starten als Studierende. Mitarbeitende können Buchungen von Studierenden ersetzen (siehe Kapitel 4).
- **Löschen** entfernt eine Person endgültig (siehe Kapitel 12). Das lässt sich nicht rückgängig machen.
- TU-ID-Konten entstehen automatisch beim ersten Login, als Mitglied. Die TU-IDs, die auf dem Server als Admins eingetragen sind, werden Admins.

**Schlüssel für den Live-Status** und **QR-Etiketten für alle Roboter**: siehe Kapitel 7 und 9.

## 14. Rechte im Überblick

| Aktion | Wer darf das |
|---|---|
| Roboter anlegen/löschen, Nutzer verwalten | Admin |
| Status, Standort und Beschreibung eines Roboters ändern | Admin, verantwortliche Person |
| Reservieren, Störung melden, Protokoll schreiben, kommentieren | alle Mitglieder |
| Reservierung/Protokoll ändern oder löschen | Ersteller:in, Admin |
| Status/Zuständigkeit einer Meldung ändern | Admin, meldende Person, zuständige Person, Verantwortliche:r des Roboters |

## 15. Häufige Fragen

**Ich werde plötzlich abgemeldet.** Die Anmeldung gilt 12 Stunden. Danach einfach erneut anmelden.

**Ich kann einen Roboter nicht reservieren.** Er ist vermutlich *defekt* oder *außer Betrieb*. Der Status steht auf der Karte.

**Meine Reservierung wird abgelehnt, obwohl der Kalender frei aussieht.** Ist ein Filter aktiv (Roboter oder *Nur meine*)? Dann sind andere Buchungen ausgeblendet. Die Meldung nennt die Überschneidung und schlägt einen freien Zeitraum vor.

**Die Scroll-Story stört.** Unter *Darstellung* → *Willkommens-Story vor der Anmeldung zeigen* ausschalten. Bei aktivierter Betriebssystem-Einstellung „Bewegung reduzieren“ wird es ohnehin übersprungen.
