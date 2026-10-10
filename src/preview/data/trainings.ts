// Unterweisungs-Bibliothek (Modul C), Deutsch und Englisch.
//
// ENTWURF. Diese Texte sind ein Vorschlag für den Prototyp und nicht von einer
// Fachkraft für Arbeitssicherheit freigegeben. Sie sind allgemein gehalten und
// ersetzen weder die Unterweisung vor Ort durch den Entleiher noch – beim
// Stapler – Fahrausweis und schriftliche Beauftragung. In der echten
// Umsetzung liegen die Inhalte als JSON in der Tabelle `trainings`.
import type { Lang } from "../logic/types";
import type { ModulId } from "../logic/unterweisung";

export type L = { de: string; en: string };

export interface Karte {
  icon: string;
  titel: L;
  text: L;
}

export interface QuizFrage {
  frage: L;
  // `karte` ist die Karte, die bei falscher Antwort erneut gezeigt wird
  optionen: Array<{ text: L; richtig: boolean }>;
  karte: number;
}

export interface Modul {
  id: ModulId;
  titel: L;
  kurz: L;
  pflichtFuer: L;
  minuten: number;
  video: L;
  karten: Karte[];
  quiz: QuizFrage[];
  hinweis?: L;
}

export const AKTUELLE_VERSION = "2026.1";

export const NACHWEIS_HINWEIS: L = {
  de: "Dieser Nachweis ersetzt nicht die Unterweisung vor Ort durch den Entleiher. Für Flurförderzeuge ersetzt er nicht den Fahrausweis und die schriftliche Beauftragung.",
  en: "This record does not replace the on-site briefing by the client. For forklifts it does not replace the operator licence and written authorisation.",
};

export function t(x: L, lang: Lang): string {
  return x[lang];
}

const ja = (de: string, en: string) => ({ text: { de, en }, richtig: true });
const nein = (de: string, en: string) => ({ text: { de, en }, richtig: false });

export const MODULE: Modul[] = [
  {
    id: "grund",
    titel: { de: "Grundunterweisung Event", en: "Event basics briefing" },
    kurz: { de: "Verhalten auf dem Gelände, Notfall, Pausen", en: "Behaviour on site, emergencies, breaks" },
    pflichtFuer: { de: "alle", en: "everyone" },
    minuten: 3,
    video: { de: "Kurzvideo: Ankommen auf dem Gelände (folgt)", en: "Short video: arriving on site (coming soon)" },
    karten: [
      { icon: "🚪", titel: { de: "Ankommen", en: "Arriving" }, text: { de: "Fluchtwege, Notausgänge und Sammelplatz gleich beim Ankommen erfragen und einprägen. Dem Ansprechpartner vor Ort melden.", en: "Ask for escape routes, emergency exits and the assembly point as soon as you arrive. Report to the contact on site." } },
      { icon: "⛑️", titel: { de: "Erste Hilfe und Meldekette", en: "First aid and reporting" }, text: { de: "Verletzung oder Notfall: Ruhe bewahren, Ersthelfer rufen, Ansprechpartner und FESS informieren. Beinaheunfälle melden.", en: "Injury or emergency: stay calm, call a first aider, inform the contact on site and FESS. Report near misses." } },
      { icon: "🚫", titel: { de: "Alkohol und Drogen", en: "Alcohol and drugs" }, text: { de: "Kein Alkohol, keine Drogen und keine Mittel, die die Reaktion beeinträchtigen – weder vor noch während der Schicht.", en: "No alcohol, no drugs and nothing that slows your reactions – neither before nor during the shift." } },
      { icon: "⏱️", titel: { de: "Hitze, Wetter, Pausen", en: "Heat, weather, breaks" }, text: { de: "Bei Hitze genug trinken und Pausen im Schatten machen. Bei Gewitter oder Sturm Anweisungen der Einsatzleitung folgen. Pausenzeiten einhalten und eintragen.", en: "In heat drink enough and rest in the shade. In storms follow the site management. Keep your breaks and record them." } },
    ],
    quiz: [
      { frage: { de: "Was erfragst du direkt nach dem Ankommen?", en: "What do you ask for right after arriving?" }, optionen: [ja("Fluchtwege, Notausgänge und Sammelplatz", "Escape routes, emergency exits and assembly point"), nein("Wo es Verpflegung gibt", "Where the catering is"), nein("Wann Feierabend ist", "When the shift ends")], karte: 0 },
      { frage: { de: "Du siehst einen Beinaheunfall. Was tust du?", en: "You see a near miss. What do you do?" }, optionen: [nein("Nichts, es ist ja nichts passiert", "Nothing, nothing happened"), ja("Ansprechpartner und FESS informieren", "Inform the contact on site and FESS"), nein("Nur den Kollegen ansprechen", "Only talk to the colleague")], karte: 1 },
      { frage: { de: "Wie ist es mit Alkohol vor der Schicht?", en: "What about alcohol before the shift?" }, optionen: [nein("Ein Bier geht", "One beer is fine"), nein("Nur nach dem Mittag", "Only after lunch"), ja("Kein Alkohol", "No alcohol")], karte: 2 },
      { frage: { de: "Es ist sehr heiß. Was ist richtig?", en: "It is very hot. What is right?" }, optionen: [ja("Genug trinken, Pausen im Schatten", "Drink enough, rest in the shade"), nein("Pausen ausfallen lassen", "Skip breaks"), nein("Erst trinken, wenn man Durst hat", "Only drink when thirsty")], karte: 3 },
      { frage: { de: "Wer ist bei einem Notfall zu informieren?", en: "Who do you inform in an emergency?" }, optionen: [nein("Niemand, das klärt sich", "Nobody, it sorts itself out"), ja("Ersthelfer, Ansprechpartner vor Ort, FESS", "First aider, contact on site, FESS"), nein("Nur den Kunden per Mail", "Only the client by email")], karte: 1 },
    ],
  },
  {
    id: "stagehand",
    titel: { de: "Stagehand: Auf- und Abbau", en: "Stagehand: load-in and load-out" },
    kurz: { de: "Heben, Tragen, Cases, Rampen, Absturzkanten", en: "Lifting, carrying, cases, ramps, edges" },
    pflichtFuer: { de: "Stagehand, Ladehelfer", en: "stagehands, loaders" },
    minuten: 3,
    video: { de: "Kurzvideo: Teamheben und Rampen (folgt)", en: "Short video: team lifting and ramps (coming soon)" },
    karten: [
      { icon: "🏋️", titel: { de: "Heben und Tragen", en: "Lifting and carrying" }, text: { de: "Schwere Lasten zu zweit oder mit Hilfsmittel. Rücken gerade, aus den Beinen heben, nicht unter Last drehen.", en: "Heavy loads with two people or an aid. Straight back, lift with your legs, do not twist under load." } },
      { icon: "📦", titel: { de: "Cases und Rampen", en: "Cases and ramps" }, text: { de: "Bremsen an Cases feststellen. Rampen nie allein befahren. Auf Kabel, Kanten und Absturzkanten achten.", en: "Lock the brakes on cases. Never take a ramp alone. Watch for cables, edges and drop-offs." } },
      { icon: "🪖", titel: { de: "Schwebende Lasten", en: "Suspended loads" }, text: { de: "Nie unter schwebenden Lasten aufhalten. Im Rigging-Bereich Helm tragen und Absperrungen beachten.", en: "Never stand under suspended loads. Wear a helmet in rigging areas and respect barriers." } },
      { icon: "🥾", titel: { de: "PSA", en: "PPE" }, text: { de: "S3-Sicherheitsschuhe und Handschuhe sind Pflicht. Fehlt etwas oder ist es defekt: vor Arbeitsbeginn melden.", en: "S3 safety boots and gloves are mandatory. If something is missing or broken, report it before you start." } },
    ],
    quiz: [
      { frage: { de: "Ein Case ist schwer. Was ist richtig?", en: "A case is heavy. What is right?" }, optionen: [nein("Allein probieren", "Try alone"), ja("Zu zweit oder mit Hilfsmittel", "Two people or an aid"), nein("Schnell anheben, dann ist es kurz", "Lift fast so it is short")], karte: 0 },
      { frage: { de: "Was gilt für Rampen?", en: "What applies to ramps?" }, optionen: [ja("Nie allein befahren, Bremsen feststellen", "Never alone, lock the brakes"), nein("Mit Schwung nehmen", "Take them with momentum"), nein("Nur bei Regen vorsichtig sein", "Only be careful in rain")], karte: 1 },
      { frage: { de: "Wo hältst du dich nicht auf?", en: "Where do you not stay?" }, optionen: [nein("Neben dem LKW", "Next to the truck"), ja("Unter schwebenden Lasten", "Under suspended loads"), nein("In der Pause im Schatten", "In the shade during breaks")], karte: 2 },
      { frage: { de: "Deine Sicherheitsschuhe sind kaputt. Was tust du?", en: "Your safety boots are broken. What do you do?" }, optionen: [nein("Trotzdem anfangen", "Start anyway"), ja("Vor Arbeitsbeginn melden", "Report before starting"), nein("Turnschuhe anziehen", "Wear trainers")], karte: 3 },
      { frage: { de: "Wie hebst du richtig?", en: "How do you lift correctly?" }, optionen: [ja("Rücken gerade, aus den Beinen, nicht drehen", "Straight back, legs, no twisting"), nein("Rücken rund, schnell", "Round back, fast"), nein("Mit gestreckten Beinen", "With straight legs")], karte: 0 },
    ],
  },
  {
    id: "catering",
    titel: { de: "Catering und Gastro", en: "Catering and hospitality" },
    kurz: { de: "Hygiene, Allergene, heiße Flüssigkeiten, Böden", en: "Hygiene, allergens, hot liquids, floors" },
    pflichtFuer: { de: "Catering, Bar, Spüle", en: "catering, bar, dishwashing" },
    minuten: 3,
    video: { de: "Kurzvideo: Hygiene am Buffet (folgt)", en: "Short video: buffet hygiene (coming soon)" },
    karten: [
      { icon: "🧼", titel: { de: "Lebensmittelhygiene", en: "Food hygiene" }, text: { de: "Hände vor Arbeitsbeginn und nach jeder Unterbrechung waschen. Kühlkette einhalten, rohe und gegarte Ware trennen.", en: "Wash hands before starting and after every break. Keep the cold chain, separate raw and cooked food." } },
      { icon: "🥜", titel: { de: "Allergene", en: "Allergens" }, text: { de: "Bei Fragen zu Allergenen nicht raten: an die Schichtleitung verweisen. Kennzeichnung nie verändern.", en: "If asked about allergens do not guess: refer to the shift lead. Never change labelling." } },
      { icon: "☕", titel: { de: "Heiß und scharf", en: "Hot and sharp" }, text: { de: "Heiße Flüssigkeiten und Fett vorsichtig tragen, Warnung rufen. Messer sicher führen und ablegen, nie fallende Messer fangen.", en: "Carry hot liquids and fat carefully and call a warning. Handle and put down knives safely, never catch a falling knife." } },
      { icon: "🧯", titel: { de: "Böden und Gas", en: "Floors and gas" }, text: { de: "Verschüttetes sofort aufnehmen und Rutschstellen kennzeichnen. Gasflaschen nur nach Einweisung anschließen.", en: "Wipe up spills at once and mark slippery spots. Only connect gas cylinders after instruction." } },
    ],
    quiz: [
      { frage: { de: "Wann wäschst du die Hände?", en: "When do you wash your hands?" }, optionen: [ja("Vor Beginn und nach jeder Unterbrechung", "Before starting and after every break"), nein("Nur nach dem Toilettengang", "Only after the toilet"), nein("Am Ende der Schicht", "At the end of the shift")], karte: 0 },
      { frage: { de: "Ein Gast fragt nach Allergenen. Was tust du?", en: "A guest asks about allergens. What do you do?" }, optionen: [nein("Eine Vermutung nennen", "Give a guess"), ja("An die Schichtleitung verweisen", "Refer to the shift lead"), nein("Sagen, es sei unbedenklich", "Say it is harmless")], karte: 1 },
      { frage: { de: "Du trägst heißen Kaffee durch die Gasse. Was tust du?", en: "You carry hot coffee through the aisle. What do you do?" }, optionen: [nein("Schnell laufen", "Run"), ja("Vorsichtig gehen und laut warnen", "Walk carefully and call out"), nein("Mit einer Hand tragen", "Carry with one hand")], karte: 2 },
      { frage: { de: "Es liegt Flüssigkeit auf dem Boden.", en: "There is liquid on the floor." }, optionen: [nein("Später aufwischen", "Wipe up later"), ja("Sofort aufnehmen, Stelle kennzeichnen", "Wipe up at once, mark the spot"), nein("Drüberlaufen", "Walk over it")], karte: 3 },
      { frage: { de: "Gasflaschen schließt du an …", en: "You connect gas cylinders …" }, optionen: [nein("wenn es schnell gehen muss", "when in a hurry"), nein("nach Gefühl", "by feel"), ja("nur nach Einweisung", "only after instruction")], karte: 3 },
    ],
  },
  {
    id: "stapler",
    titel: { de: "Flurförderzeuge", en: "Industrial trucks" },
    kurz: { de: "Sichtprüfung, Lastdiagramm, Fahren mit Last, Fußgänger", en: "Inspection, load chart, driving, pedestrians" },
    pflichtFuer: { de: "Staplerfahrer – zusätzlich Upload Fahrausweis", en: "forklift drivers – plus operator licence upload" },
    minuten: 3,
    video: { de: "Kurzvideo: Sichtprüfung am Stapler (folgt)", en: "Short video: forklift inspection (coming soon)" },
    hinweis: { de: "Fahren darf nur, wer einen Fahrausweis hat und schriftlich beauftragt ist. Diese Unterweisung ersetzt beides nicht.", en: "Only drivers with an operator licence and written authorisation may drive. This briefing replaces neither." },
    karten: [
      { icon: "🔍", titel: { de: "Sichtprüfung", en: "Inspection" }, text: { de: "Vor jeder Schicht: Gabeln, Ketten, Reifen, Beleuchtung, Hupe, Bremse. Mängel melden, defekten Stapler nicht benutzen.", en: "Before every shift: forks, chains, tyres, lights, horn, brakes. Report faults, do not use a defective truck." } },
      { icon: "⚖️", titel: { de: "Last und Fahren", en: "Load and driving" }, text: { de: "Lastdiagramm beachten, Last tief und nah am Mast tragen. Bergab rückwärts, in Kurven langsam.", en: "Respect the load chart, carry the load low and close to the mast. Reverse downhill, slow in corners." } },
      { icon: "🚶", titel: { de: "Fußgänger", en: "Pedestrians" }, text: { de: "Fußgänger haben Vorrang bei Unklarheit. Blickkontakt suchen, nie Personen auf den Gabeln mitnehmen oder anheben.", en: "Pedestrians have priority when in doubt. Make eye contact, never carry or lift people on the forks." } },
      { icon: "🅿️", titel: { de: "Abstellen und Laden", en: "Parking and charging" }, text: { de: "Gabeln absenken, Feststellbremse, Schlüssel abziehen. Akku und Gas nur an dafür vorgesehenen Stellen laden bzw. wechseln.", en: "Lower the forks, set the parking brake, remove the key. Charge batteries and change gas only at designated places." } },
    ],
    quiz: [
      { frage: { de: "Wann prüfst du den Stapler?", en: "When do you inspect the truck?" }, optionen: [nein("Nur bei Auffälligkeiten", "Only if something seems off"), ja("Vor jeder Schicht", "Before every shift"), nein("Einmal pro Woche", "Once a week")], karte: 0 },
      { frage: { de: "Wie trägst du die Last?", en: "How do you carry the load?" }, optionen: [ja("Tief und nah am Mast", "Low and close to the mast"), nein("Hoch für bessere Sicht", "High for better view"), nein("Weit vorn, damit es schneller geht", "Far forward to be quicker")], karte: 1 },
      { frage: { de: "Eine Person will auf den Gabeln mitfahren.", en: "Someone wants a ride on the forks." }, optionen: [nein("Kurz geht schon", "Just briefly"), ja("Nein, nie", "No, never"), nein("Nur im Lager", "Only in the warehouse")], karte: 2 },
      { frage: { de: "Du fährst eine Rampe mit Last hinunter.", en: "You drive down a ramp with a load." }, optionen: [nein("Vorwärts mit Schwung", "Forwards with momentum"), ja("Rückwärts und langsam", "In reverse and slowly"), nein("Seitlich", "Sideways")], karte: 1 },
      { frage: { de: "Beim Abstellen …", en: "When parking …" }, optionen: [nein("Gabeln oben lassen", "leave the forks up"), ja("Gabeln absenken, Bremse, Schlüssel ab", "lower forks, set brake, remove key"), nein("Motor laufen lassen", "leave the engine running")], karte: 3 },
    ],
  },
  {
    id: "hoehe",
    titel: { de: "Höhe und Leitern", en: "Heights and ladders" },
    kurz: { de: "Leitern, Podeste, Rollgerüste", en: "Ladders, platforms, mobile scaffolds" },
    pflichtFuer: { de: "wenn im Auftrag hinterlegt", en: "if specified in the job" },
    minuten: 3,
    video: { de: "Kurzvideo: Leiter richtig stellen (folgt)", en: "Short video: setting up a ladder (coming soon)" },
    karten: [
      { icon: "🪜", titel: { de: "Leitern", en: "Ladders" }, text: { de: "Vor Gebrauch prüfen, standsicher aufstellen, drei Punkte Kontakt halten. Nie auf die oberste Sprosse steigen.", en: "Check before use, set up on firm ground, keep three points of contact. Never stand on the top rung." } },
      { icon: "🧱", titel: { de: "Podeste", en: "Platforms" }, text: { de: "Podeste nur mit Geländer oder Absturzsicherung nutzen und nicht überladen. Auf Kanten achten.", en: "Use platforms only with railings or fall protection and do not overload them. Watch the edges." } },
      { icon: "🛞", titel: { de: "Rollgerüste", en: "Mobile scaffolds" }, text: { de: "Räder feststellen, nur mit eingewiesenem Aufbau betreten, nicht mit Personen verfahren.", en: "Lock the wheels, only enter an instructed setup, never move it with people on it." } },
      { icon: "🛑", titel: { de: "Wenn etwas fehlt", en: "If something is missing" }, text: { de: "Fehlt eine Sicherung oder bist du unsicher: nicht hinaufsteigen, Teamleiter fragen.", en: "If a safeguard is missing or you are unsure: do not climb, ask the team lead." } },
    ],
    quiz: [
      { frage: { de: "Wie viele Kontaktpunkte hältst du an der Leiter?", en: "How many points of contact on a ladder?" }, optionen: [nein("Einen", "One"), ja("Drei", "Three"), nein("Keinen, wenn man geschickt ist", "None if skilled")], karte: 0 },
      { frage: { de: "Auf welche Sprosse steigst du nie?", en: "Which rung do you never stand on?" }, optionen: [nein("Die unterste", "The bottom one"), ja("Die oberste", "The top one"), nein("Die mittlere", "The middle one")], karte: 0 },
      { frage: { de: "Ein Podest hat kein Geländer. Was tust du?", en: "A platform has no railing. What do you do?" }, optionen: [nein("Vorsichtig arbeiten", "Work carefully"), ja("Nicht betreten, Teamleiter fragen", "Do not enter, ask the team lead"), nein("Selbst etwas basteln", "Improvise something")], karte: 1 },
      { frage: { de: "Beim Rollgerüst …", en: "With a mobile scaffold …" }, optionen: [ja("Räder feststellen, nicht mit Personen verfahren", "lock wheels, never move with people"), nein("Mit Personen verfahren geht kurz", "moving with people is fine briefly"), nein("Räder bleiben offen", "wheels stay free")], karte: 2 },
      { frage: { de: "Du bist unsicher bei der Höhe.", en: "You feel unsure about the height." }, optionen: [nein("Trotzdem hoch", "Go up anyway"), ja("Nicht hinaufsteigen, Bescheid sagen", "Do not climb, speak up"), nein("Kollegen schicken, ohne etwas zu sagen", "Send a colleague without saying anything")], karte: 3 },
    ],
  },
  {
    id: "elektrik",
    titel: { de: "Elektrik und Kabel", en: "Electrics and cables" },
    kurz: { de: "Sichtprüfung, keine Eingriffe, Kabelbrücken, Nässe", en: "Inspection, no tampering, cable ramps, wet" },
    pflichtFuer: { de: "Stagehand, Technik-Helfer", en: "stagehands, technical helpers" },
    minuten: 3,
    video: { de: "Kurzvideo: Kabel sicher verlegen (folgt)", en: "Short video: laying cables safely (coming soon)" },
    karten: [
      { icon: "🔌", titel: { de: "Sichtprüfung", en: "Visual check" }, text: { de: "Beschädigte Kabel, Stecker oder Verteiler nicht benutzen. Defekt melden und kennzeichnen.", en: "Do not use damaged cables, plugs or distributors. Report and tag the defect." } },
      { icon: "🛠️", titel: { de: "Keine Eingriffe", en: "No tampering" }, text: { de: "Elektrische Anlagen werden nur von Elektrofachkräften geöffnet oder repariert. Nie selbst basteln.", en: "Electrical equipment is opened or repaired only by qualified electricians. Never improvise." } },
      { icon: "🌉", titel: { de: "Kabelbrücken", en: "Cable ramps" }, text: { de: "Kabel in Laufwegen mit Kabelbrücken oder Tape sichern, damit niemand stolpert und nichts gequetscht wird.", en: "Cover cables in walkways with cable ramps or tape so nobody trips and nothing gets crushed." } },
      { icon: "💧", titel: { de: "Nässe", en: "Wet conditions" }, text: { de: "Bei Nässe keine Steckverbindungen auf dem Boden. Bei Zweifel Strom abschalten lassen und Teamleiter holen.", en: "In wet conditions no plug connections on the floor. If in doubt have the power switched off and call the team lead." } },
    ],
    quiz: [
      { frage: { de: "Ein Kabel hat einen Riss in der Isolierung.", en: "A cable has a crack in the insulation." }, optionen: [nein("Mit Tape reparieren", "Repair with tape"), ja("Nicht benutzen, melden und kennzeichnen", "Do not use, report and tag"), nein("Vorsichtig weiterverwenden", "Keep using carefully")], karte: 0 },
      { frage: { de: "Ein Verteiler macht Probleme. Wer öffnet ihn?", en: "A distributor has problems. Who opens it?" }, optionen: [nein("Der, der sich auskennt", "Whoever knows about it"), ja("Nur eine Elektrofachkraft", "Only a qualified electrician"), nein("Jeder mit Werkzeug", "Anyone with tools")], karte: 1 },
      { frage: { de: "Kabel liegt im Laufweg.", en: "A cable lies in the walkway." }, optionen: [ja("Mit Kabelbrücke oder Tape sichern", "Secure with a cable ramp or tape"), nein("Liegen lassen", "Leave it"), nein("Mit einem Case beschweren", "Weigh it down with a case")], karte: 2 },
      { frage: { de: "Es regnet, Steckverbindungen liegen auf dem Boden.", en: "It rains and plug connections lie on the floor." }, optionen: [nein("Mit einer Plane abdecken und weiter", "Cover with a tarp and carry on"), ja("Strom abschalten lassen, Teamleiter holen", "Have the power switched off, get the team lead"), nein("Schnell fertigmachen", "Finish quickly")], karte: 3 },
      { frage: { de: "Du reparierst eine Steckdose selbst, weil du es kannst.", en: "You repair a socket yourself because you can." }, optionen: [nein("Das ist in Ordnung", "That is fine"), ja("Nein, das tun nur Elektrofachkräfte", "No, only qualified electricians do that"), nein("Nur wenn es eilig ist", "Only if urgent")], karte: 1 },
    ],
  },
  {
    id: "einlass",
    titel: { de: "Einlass", en: "Entrance" },
    kurz: { de: "Einlass, Deeskalation, Rettungswege", en: "Entrance, de-escalation, escape routes" },
    pflichtFuer: { de: "Einlass (nicht § 34a)", en: "entrance staff (not § 34a)" },
    minuten: 3,
    video: { de: "Kurzvideo: Ruhig bleiben im Gedränge (folgt)", en: "Short video: staying calm in a crowd (coming soon)" },
    hinweis: { de: "Diese Unterweisung ersetzt keine Sachkunde nach § 34a. Sicherheitsaufgaben bleiben dafür qualifiziertem Personal vorbehalten.", en: "This briefing does not replace the § 34a licence. Security duties stay with qualified personnel." },
    karten: [
      { icon: "🎟️", titel: { de: "Einlass", en: "Entrance" }, text: { de: "Tickets und Bändchen nach Vorgabe prüfen, Taschenkontrolle nur nach Anweisung. Freundlich bleiben und klar sein.", en: "Check tickets and wristbands as instructed, bag checks only as instructed. Stay friendly and clear." } },
      { icon: "🕊️", titel: { de: "Deeskalation", en: "De-escalation" }, text: { de: "Ruhig sprechen, Abstand halten, nicht provozieren lassen. Bei Aggression nicht allein bleiben, Verstärkung rufen.", en: "Speak calmly, keep your distance, do not get provoked. Do not stay alone with aggression, call for backup." } },
      { icon: "🧭", titel: { de: "Rettungswege", en: "Escape routes" }, text: { de: "Rettungswege und Notausgänge freihalten – nie zustellen, nie abschließen. Kapazitätsgrenzen beachten.", en: "Keep escape routes and emergency exits clear – never block or lock them. Respect capacity limits." } },
      { icon: "📣", titel: { de: "Melden", en: "Reporting" }, text: { de: "Gefährliche Situationen sofort an Einsatzleitung und Sicherheitsdienst melden, nicht selbst eingreifen.", en: "Report dangerous situations to site management and security right away, do not intervene yourself." } },
    ],
    quiz: [
      { frage: { de: "Ein Gast wird laut. Was tust du?", en: "A guest gets loud. What do you do?" }, optionen: [ja("Ruhig bleiben, Abstand halten, Verstärkung rufen", "Stay calm, keep distance, call backup"), nein("Zurückschreien", "Shout back"), nein("Festhalten", "Hold him")], karte: 1 },
      { frage: { de: "Ein Notausgang ist zugestellt.", en: "An emergency exit is blocked." }, optionen: [nein("Später aufräumen", "Clear later"), ja("Sofort freimachen und melden", "Clear it now and report"), nein("Nichts, er wird ja nicht gebraucht", "Nothing, it will not be needed")], karte: 2 },
      { frage: { de: "Taschenkontrolle …", en: "Bag checks …" }, optionen: [nein("nach eigenem Ermessen", "at my own discretion"), ja("nur nach Anweisung", "only as instructed"), nein("bei allen sehr gründlich, auch körperlich", "very thoroughly for everyone, including body")], karte: 0 },
      { frage: { de: "Du siehst eine Schlägerei.", en: "You see a fight." }, optionen: [nein("Dazwischengehen", "Step in"), ja("Einsatzleitung und Sicherheitsdienst rufen", "Call site management and security"), nein("Wegsehen", "Look away")], karte: 3 },
      { frage: { de: "Wie viele Personen dürfen in den Bereich?", en: "How many people may enter the area?" }, optionen: [nein("So viele passen", "As many as fit"), ja("Bis zur freigegebenen Kapazität", "Up to the approved capacity"), nein("Egal, wenn es ruhig bleibt", "Whatever, if it stays calm")], karte: 2 },
    ],
  },
  {
    id: "brandschutz",
    titel: { de: "Brandschutz", en: "Fire safety" },
    kurz: { de: "Feuerlöscher, Alarmierung, Evakuierung", en: "Extinguishers, alarm, evacuation" },
    pflichtFuer: { de: "alle, jährlich", en: "everyone, annually" },
    minuten: 3,
    video: { de: "Kurzvideo: Feuerlöscher bedienen (folgt)", en: "Short video: using an extinguisher (coming soon)" },
    karten: [
      { icon: "🔥", titel: { de: "Entstehungsbrand", en: "Small fire" }, text: { de: "Alarm auslösen oder rufen, nur kleine Brände und nur ohne Eigengefahr bekämpfen. Rückzugsweg im Rücken behalten.", en: "Raise the alarm or shout, fight only small fires and only without risk to yourself. Keep your escape route behind you." } },
      { icon: "🧯", titel: { de: "Feuerlöscher", en: "Extinguisher" }, text: { de: "Standorte beim Ankommen merken. Sicherungsstift ziehen, auf die Flammenbasis zielen, in Etappen löschen.", en: "Note locations on arrival. Pull the pin, aim at the base of the flames, extinguish in bursts." } },
      { icon: "📞", titel: { de: "Alarmierung", en: "Raising the alarm" }, text: { de: "Notruf 112: wo es brennt, was brennt, wie viele Personen betroffen, wer meldet – und auf Rückfragen warten.", en: "Emergency 112: where, what is burning, how many people affected, who is calling – and wait for questions." } },
      { icon: "🏃", titel: { de: "Evakuierung", en: "Evacuation" }, text: { de: "Gelände auf dem kürzesten Fluchtweg verlassen, zum Sammelplatz gehen, nicht umkehren. Aufzüge nicht benutzen.", en: "Leave on the shortest escape route, go to the assembly point, do not turn back. Do not use lifts." } },
    ],
    quiz: [
      { frage: { de: "Wann bekämpfst du einen Brand selbst?", en: "When do you fight a fire yourself?" }, optionen: [ja("Nur kleine Brände und ohne Eigengefahr", "Only small fires and without risk"), nein("Immer", "Always"), nein("Nie, auch nicht einen brennenden Papierkorb", "Never, not even a burning waste bin")], karte: 0 },
      { frage: { de: "Worauf zielst du mit dem Löscher?", en: "Where do you aim the extinguisher?" }, optionen: [nein("Auf die Flammenspitzen", "At the tips of the flames"), ja("Auf die Flammenbasis", "At the base of the flames"), nein("In die Luft", "Into the air")], karte: 1 },
      { frage: { de: "Welche Nummer wählst du im Notfall?", en: "Which number do you call in an emergency?" }, optionen: [nein("110", "110"), ja("112", "112"), nein("116 117", "116 117")], karte: 2 },
      { frage: { de: "Bei einer Evakuierung …", en: "During an evacuation …" }, optionen: [nein("holst du erst deine Sachen", "you fetch your belongings first"), nein("nutzt du den Aufzug", "you take the lift"), ja("gehst du zum Sammelplatz", "you go to the assembly point")], karte: 3 },
      { frage: { de: "Wann merkst du dir die Löscherstandorte?", en: "When do you note the extinguisher locations?" }, optionen: [ja("Beim Ankommen", "On arrival"), nein("Wenn es brennt", "When there is a fire"), nein("Gar nicht, das macht jemand anderes", "Never, someone else does")], karte: 1 },
    ],
  },
];

export function modulById(id: string): Modul | undefined {
  return MODULE.find((m) => m.id === id);
}
