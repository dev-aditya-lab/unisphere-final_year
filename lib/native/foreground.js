/**
 * A push that arrives while the app is open is shown as a banner (Android shows nothing by itself then). If the member is already looking at
 * the page the push is about, for example the conversation a new message belongs to, the banner would only repeat what is on the screen.
 * Pure, so it is tested directly.
 */
const base = (path) => String(path ?? "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";

export const isAlreadyThere = (currentPath, targetPath) => base(currentPath) === base(targetPath);
