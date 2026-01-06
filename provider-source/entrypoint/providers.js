import { gatherAllEmbeds, gatherAllSources } from '@/providers/all';
export function getBuiltinSources() {
    return gatherAllSources().filter((v) => !v.disabled && !v.externalSource);
}
export function getBuiltinExternalSources() {
    return gatherAllSources().filter((v) => v.externalSource && !v.disabled);
}
export function getBuiltinEmbeds() {
    return gatherAllEmbeds().filter((v) => !v.disabled);
}
