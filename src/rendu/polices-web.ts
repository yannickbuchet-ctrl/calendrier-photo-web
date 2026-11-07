/** Fichiers des polices libres (OFL), chargés à la demande depuis le site lui-même (aucun site extérieur). */
import openSansNormal from "@expo-google-fonts/open-sans/400Regular/OpenSans_400Regular.ttf?url";
import openSansGras from "@expo-google-fonts/open-sans/700Bold/OpenSans_700Bold.ttf?url";
import gelasioNormal from "@expo-google-fonts/gelasio/400Regular/Gelasio_400Regular.ttf?url";
import gelasioGras from "@expo-google-fonts/gelasio/700Bold/Gelasio_700Bold.ttf?url";
import kalamNormal from "@expo-google-fonts/kalam/400Regular/Kalam_400Regular.ttf?url";
import kalamGras from "@expo-google-fonts/kalam/700Bold/Kalam_700Bold.ttf?url";
import { Police } from "./police";

/** Moderne (Open Sans), Élégant (Gelasio), Manuscrit (Kalam) : style normal et gras. */
const FICHIERS: [string, string][] = [[openSansNormal, openSansGras], [gelasioNormal, gelasioGras], [kalamNormal, kalamGras]];

export interface JeuPolices {
  normal: Police;
  gras: Police;
}

const chargees = new Map<number, Promise<JeuPolices>>();

async function lire(url: string): Promise<Police> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Police introuvable (${r.status}).`);
  return new Police(new Uint8Array(await r.arrayBuffer()));
}

export function chargerPolices(style: number): Promise<JeuPolices> {
  let p = chargees.get(style);
  if (!p) {
    const [normal, gras] = FICHIERS[style] ?? FICHIERS[0];
    p = Promise.all([lire(normal), lire(gras)]).then(([n, g]) => ({ normal: n, gras: g }));
    p.catch(() => chargees.delete(style));
    chargees.set(style, p);
  }
  return p;
}
