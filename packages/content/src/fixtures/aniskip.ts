/**
 * Response bodies from https://api.aniskip.com/v2/skip-times/{malId}/{episode} (sampled 2026-11-24),
 * unchanged: MAL id 16498 episode 1 with every skip type requested, and the body that comes with
 * HTTP 404 when nothing is known. (The sample has no "recap" entry; the test adds one by hand.)
 */

export const ANISKIP_16498_EP1 = {
  "found": true,
  "results": [
    {
      "interval": {
        "startTime": 47.365,
        "endTime": 137.365
      },
      "skipType": "op",
      "skipId": "c8303b7d-2e87-401b-ae30-b1a2b18943ac",
      "episodeLength": 1540.061
    },
    {
      "interval": {
        "startTime": 1342.795,
        "endTime": 1430.616
      },
      "skipType": "ed",
      "skipId": "d7b4737b-d3b9-4009-bbbf-1fb52a02d746",
      "episodeLength": 1446.9973
    },
    {
      "interval": {
        "startTime": 75,
        "endTime": 135
      },
      "skipType": "mixed-op",
      "skipId": "8e1769d5-bcae-4dc4-ae5a-98fa8c6f1f56",
      "episodeLength": 1420
    },
    {
      "interval": {
        "startTime": 24.41,
        "endTime": 114.41
      },
      "skipType": "mixed-ed",
      "skipId": "d71ac9f5-1c33-46ef-82ff-bd33744e73aa",
      "episodeLength": 1464.4
    }
  ],
  "message": "Successfully found skip times",
  "statusCode": 200
};

export const ANISKIP_NOT_FOUND = {
  "found": false,
  "results": [],
  "message": "No skip times found",
  "statusCode": 404
};
