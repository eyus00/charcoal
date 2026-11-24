/**
 * Response bodies from POST https://graphql.anilist.co (sampled 2026-11-24), unchanged:
 * the titles query for AniList id 16498, and the body that comes with HTTP 404 for an unknown id.
 */

export const ANILIST_MEDIA_16498 = {
  "data": {
    "Media": {
      "id": 16498,
      "idMal": 16498,
      "format": "TV",
      "episodes": 25,
      "title": {
        "romaji": "Shingeki no Kyojin",
        "english": "Attack on Titan",
        "native": "進撃の巨人"
      },
      "synonyms": [
        "SnK",
        "AoT",
        "Ataque a los Titanes",
        "Ataque dos Titãs",
        "L'Attacco dei Giganti",
        "מתקפת הטיטאנים",
        "进击的巨人",
        "L’Attaque des Titans",
        "الهجوم على العمالقة",
        "ผ่าพิภพไททัน",
        "حمله به تایتان",
        "Ataque de Titãs",
        "Atak Tytanów",
        "Атака титанов",
        "Đại Chiến Titan"
      ]
    }
  }
};

export const ANILIST_NOT_FOUND = {
  "errors": [
    {
      "message": "Not Found.",
      "status": 404,
      "locations": [
        {
          "line": 1,
          "column": 20
        }
      ]
    }
  ],
  "data": {
    "Media": null
  }
};
