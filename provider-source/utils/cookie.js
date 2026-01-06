import cookie from 'cookie';
import setCookieParser from 'set-cookie-parser';
export function makeCookieHeader(cookies) {
    return Object.entries(cookies)
        .map(([name, value]) => cookie.serialize(name, value))
        .join('; ');
}
export function parseSetCookie(headerValue) {
    const splitHeaderValue = setCookieParser.splitCookiesString(headerValue);
    const parsedCookies = setCookieParser.parse(splitHeaderValue, {
        map: true,
    });
    return parsedCookies;
}
export function getSetCookieHeader(headers) {
    // Try Set-Cookie first, then x-set-cookie (for proxy scenarios)
    return headers.get('Set-Cookie') ?? headers.get('x-set-cookie') ?? '';
}
