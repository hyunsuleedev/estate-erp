/** The postcode SDK redirects its embedded HTTP development URL to HTTPS. */
export function isPostcodeFrameRedirect(
  rawUrl: string,
  isMainFrame: boolean,
): boolean {
  if (isMainFrame) return false;
  try {
    const url = new URL(rawUrl);
    return (
      url.origin === 'https://postcode.map.kakao.com' &&
      url.pathname === '/search' &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
