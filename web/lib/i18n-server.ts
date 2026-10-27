import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang, translator, type Lang, type T } from "./i18n";

/** Language chosen with the header's EN | VI switch, for server components and route metadata. */
export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT(): Promise<T> {
  return translator(await getLang());
}
