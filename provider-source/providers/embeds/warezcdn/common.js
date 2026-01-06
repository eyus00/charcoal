import { warezcdnPlayerBase } from '@/providers/sources/warezcdn/common';
import { NotFoundError } from '@/utils/errors';
function decrypt(input) {
    let output = atob(input);
    // Remove leading and trailing whitespaces
    output = output.trim();
    // Reverse the string
    output = output.split('').reverse().join('');
    // Get the last 5 characters and reverse them
    let last = output.slice(-5);
    last = last.split('').reverse().join('');
    // Remove the last 5 characters from the original string
    output = output.slice(0, -5);
    // Return the original string concatenated with the reversed last 5 characters
    return `${output}${last}`;
}
export async function getDecryptedId(ctx) {
    const page = await ctx.proxiedFetcher(`/player.php`, {
        baseUrl: warezcdnPlayerBase,
        headers: {
            Referer: `${warezcdnPlayerBase}/getEmbed.php?${new URLSearchParams({
                id: ctx.url,
                sv: 'warezcdn',
            })}`,
        },
        query: {
            id: ctx.url,
        },
    });
    const allowanceKey = page.match(/let allowanceKey = "(.*?)";/)?.[1];
    if (!allowanceKey)
        throw new NotFoundError('Failed to get allowanceKey');
    // this endpoint is removed hence the method no longer works
    const streamData = await ctx.proxiedFetcher('/functions.php', {
        baseUrl: warezcdnPlayerBase,
        method: 'POST',
        body: new URLSearchParams({
            getVideo: ctx.url,
            key: allowanceKey,
        }),
    });
    const stream = JSON.parse(streamData);
    if (!stream.id)
        throw new NotFoundError("can't get stream id");
    const decryptedId = decrypt(stream.id);
    if (!decryptedId)
        throw new NotFoundError("can't get file id");
    return decryptedId;
}
