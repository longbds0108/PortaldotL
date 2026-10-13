/** Shared by the client preferences store and the server-rendered boot script (no "use client" here). */
export const PREFS_KEY = "hedgora.prefs.v1";

/**
 * Runs before first paint on app routes (inline in the (app) layout) so a light-theme user never sees a dark flash.
 * Must stay self-contained: it is serialised into a <script>.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}");var c=p.theme||"dark";if(c==="system"){c=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=c}catch(e){}})();`;
