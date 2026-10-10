// Vorstellungsvideo von FESS (Willkommensvideo): eine Datei je Sprache in public/videos, ausgeliefert über die
// geschützte Medienroute (nur mit Mitarbeiter-Sitzung oder angemeldeter Administration).
import { MEDIEN_PFAD } from "./unterweisung";

export type VorstellungSprache = "de" | "en";

export const VORSTELLUNG_SPRACHEN: VorstellungSprache[] = ["de", "en"];

export function vorstellungVideo(sprache: VorstellungSprache): { video: string; poster: string } {
  return { video: `${MEDIEN_PFAD}vorstellung.${sprache}.mp4`, poster: `${MEDIEN_PFAD}vorstellung.${sprache}.jpg` };
}
