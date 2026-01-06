import { inspect } from 'node:util';
export function logDeepObject(object) {
    // This is the dev cli, so we can use console.log
    // eslint-disable-next-line no-console
    console.log(inspect(object, { showHidden: false, depth: null, colors: true }));
}
