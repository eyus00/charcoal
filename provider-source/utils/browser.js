/**
 * Browser detection utilities
 */
export function detectBrowser() {
    // Check if we're in a browser environment
    if (typeof navigator === 'undefined') {
        return 'unknown';
    }
    const userAgent = navigator.userAgent.toLowerCase();
    // Detect Chrome/Brave (Brave includes "Chrome" in its user agent)
    if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
        return 'chrome';
    }
    // Detect Firefox
    if (userAgent.includes('firefox')) {
        return 'firefox';
    }
    // Detect Safari
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
        return 'safari';
    }
    return 'unknown';
}
export function isChromeOrBrave() {
    return detectBrowser() === 'chrome';
}
export function isFirefox() {
    return detectBrowser() === 'firefox';
}
export function isSafari() {
    return detectBrowser() === 'safari';
}
