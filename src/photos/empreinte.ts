/**
 * Empreinte du contenu d'une photo : deux photos identiques (même sous un autre nom) ont la même empreinte, comme
 * same_photo de la version Windows, qui compare les fichiers octet par octet. Elle sert aussi d'identifiant.
 */

/** Empreinte SHA-256 (32 premiers chiffres hexadécimaux), ou une empreinte de secours hors d'un contexte sécurisé. */
export async function empreinte(octets: Uint8Array): Promise<string> {
  const sujet = globalThis.crypto?.subtle;
  if (sujet) {
    const h = new Uint8Array(await sujet.digest("SHA-256", octets as Uint8Array<ArrayBuffer>));
    return [...h.subarray(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Site ouvert sans HTTPS : deux sommes FNV-1a de 32 bits et la taille.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < octets.length; i++) {
    a = Math.imul(a ^ octets[i], 0x01000193) >>> 0;
    b = Math.imul(b ^ octets[octets.length - 1 - i], 0x01000193) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}${octets.length.toString(16).padStart(16, "0")}`;
}
