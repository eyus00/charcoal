/**
 * Provider health: remembers how each provider did recently and benches one that keeps failing,
 * so a dead provider stops costing every request its full timeout.
 *
 * - success: returned at least one source
 * - empty:   answered, but had nothing for this title (not a failure)
 * - failure: threw or timed out
 *
 * After FAILS_TO_BENCH failures in a row a provider sits out for a cooldown that doubles each time
 * (up to an hour). After the cooldown it gets one try; a success clears everything.
 * GET /v1/providers/health shows the table.
 */

const FAILS_TO_BENCH = Number(process.env.HEALTH_FAILS_TO_BENCH ?? 3);
const BASE_COOLDOWN_MS = Number(process.env.HEALTH_COOLDOWN_MS ?? 5 * 60_000);
const MAX_COOLDOWN_MS = 60 * 60_000;

interface Stat {
    id: string;
    name: string;
    success: number;
    empty: number;
    failure: number;
    streak: number; // failures in a row
    benchedUntil: number;
    benches: number;
    lastError?: string;
    lastOutcomeAt?: number;
    avgMs: number;
}

const stats = new Map<string, Stat>();

const stat = (id: string, name: string) => {
    let s = stats.get(id);
    if (!s) {
        s = { id, name, success: 0, empty: 0, failure: 0, streak: 0, benchedUntil: 0, benches: 0, avgMs: 0 };
        stats.set(id, s);
    }
    return s;
};

export class BenchedError extends Error {}

export function checkBench(id: string, name: string) {
    const s = stat(id, name);
    const left = s.benchedUntil - Date.now();
    if (left > 0) throw new BenchedError(`${name} is benched for ${Math.ceil(left / 1000)}s after ${s.streak} failures in a row`);
}

export function record(id: string, name: string, outcome: 'success' | 'empty' | 'failure', ms: number, error?: string) {
    const s = stat(id, name);
    s[outcome]++;
    s.lastOutcomeAt = Date.now();
    s.avgMs = s.avgMs ? Math.round(s.avgMs * 0.8 + ms * 0.2) : Math.round(ms);
    if (outcome === 'failure') {
        s.streak++;
        s.lastError = error?.slice(0, 200);
        if (s.streak >= FAILS_TO_BENCH) {
            const cooldown = Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** s.benches);
            s.benchedUntil = Date.now() + cooldown;
            s.benches++;
            console.warn(`[Jelly] benched ${name} for ${Math.round(cooldown / 1000)}s (${s.streak} failures in a row: ${s.lastError})`);
        }
    } else {
        s.streak = 0;
        s.benches = 0;
        s.benchedUntil = 0;
    }
}

export function report() {
    const now = Date.now();
    return {
        generatedAt: new Date(now).toISOString(),
        providers: [...stats.values()]
            .map((s) => ({
                id: s.id,
                name: s.name,
                status: s.benchedUntil > now ? 'benched' : s.streak > 0 ? 'failing' : s.success ? 'ok' : 'unknown',
                success: s.success,
                empty: s.empty,
                failure: s.failure,
                failuresInARow: s.streak,
                benchedForSeconds: Math.max(0, Math.ceil((s.benchedUntil - now) / 1000)),
                averageMs: s.avgMs,
                lastError: s.lastError,
                lastOutcomeAt: s.lastOutcomeAt ? new Date(s.lastOutcomeAt).toISOString() : undefined,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    };
}
