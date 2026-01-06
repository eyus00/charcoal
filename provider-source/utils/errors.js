export class NotFoundError extends Error {
    constructor(reason) {
        super(`Couldn't find a stream: ${reason ?? 'not found'}`);
        this.name = 'NotFoundError';
    }
}
