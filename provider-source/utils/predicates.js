export function hasDuplicates(values) {
    return new Set(values).size !== values.length;
}
