/**
 * Rows copied unchanged from https://iptv-org.github.io/api/ (channels.json, streams.json,
 * blocklist.json; sampled 2026-11-24) and cut down to a handful of channels. They cover:
 *   - sports channels with plain streams, a "Geo-blocked" stream and "Not 24/7" streams
 *   - a plain-http stream (FB TV) and an http + geo-blocked one (Trace Sport Stars)
 *   - streams that need a User-Agent (DD Sports), a Referer (CRTV) or both (Trace Sport Stars)
 *   - a closed channel that still has a stream (Pac-12 Insider)
 *   - a sports channel with no stream (Rai Sport) and one whose only stream is rtsp:// (TVP Sport)
 *   - a news channel (France 24), a stream with no channel, and two blocklisted channels
 *
 * The one row that is NOT real is marked below: upstream already removes the streams of
 * blocklisted channels, so a stream for Astro Arena is written by hand to test the exclusion.
 */

export const IPTV_CHANNELS: Record<string, unknown>[] = [
  {"id":"ACCDigitalNetwork.us","name":"ACC Digital Network","alt_names":["ACCDN"],"network":null,"owners":["ESPN Inc."],"country":"US","categories":["sports"],"is_nsfw":false,"launched":null,"closed":null,"replaced_by":null,"website":"https://theacc.com/watch/"},
  {"id":"AntenaPlayEvents.ro","name":"AntenaPlay Events","alt_names":[],"network":null,"owners":[],"country":"RO","categories":["sports"],"is_nsfw":false,"launched":null,"closed":null,"replaced_by":null,"website":null},
  {"id":"AstroArena.my","name":"Astro Arena","alt_names":[],"network":null,"owners":["Astro"],"country":"MY","categories":["sports"],"is_nsfw":false,"launched":"2010-03-26","closed":null,"replaced_by":null,"website":"https://www.stadiumastro.com/"},
  {"id":"CRTVSportsandEntertainment.cm","name":"CRTV Sports and Entertainment","alt_names":[],"network":null,"owners":["Government of Cameroon"],"country":"CM","categories":["sports"],"is_nsfw":false,"launched":"2019-06-06","closed":null,"replaced_by":null,"website":"https://www.crtv.cm/"},
  {"id":"DDSports.in","name":"DD Sports","alt_names":[],"network":"Doordarshan","owners":["Prasar Bharati"],"country":"IN","categories":["sports"],"is_nsfw":false,"launched":"1998-03-18","closed":null,"replaced_by":null,"website":"http://doordarshan.gov.in/ddsports"},
  {"id":"FBTV.tr","name":"FB TV","alt_names":["Fenerbahçe TV"],"network":null,"owners":["Fenerbahce S.K."],"country":"TR","categories":["sports"],"is_nsfw":false,"launched":"2003-01-19","closed":null,"replaced_by":null,"website":"https://www.fenerbahce.org/fbtv/"},
  {"id":"France24.fr","name":"France 24","alt_names":[],"network":null,"owners":["France Medias Monde"],"country":"FR","categories":["news"],"is_nsfw":false,"launched":"2006-12-06","closed":null,"replaced_by":null,"website":"https://www.france24.com/"},
  {"id":"Pac12Insider.us","name":"Pac-12 Insider","alt_names":[],"network":null,"owners":["Pac-12 Conference"],"country":"US","categories":["sports"],"is_nsfw":false,"launched":"2012-08-15","closed":"2024-07-01","replaced_by":null,"website":"https://pac-12.com/"},
  {"id":"RaiSport.it","name":"Rai Sport","alt_names":["Rai Sport 1","Rai Sport +","Rai Sport Più","Rai Sport Satellite"],"network":null,"owners":["Rai"],"country":"IT","categories":["sports"],"is_nsfw":false,"launched":"1999-02-01","closed":null,"replaced_by":null,"website":"https://www.raisport.rai.it/"},
  {"id":"TraceSportStars.fr","name":"Trace Sport Stars","alt_names":[],"network":null,"owners":[],"country":"FR","categories":["sports"],"is_nsfw":false,"launched":"2011-06-01","closed":null,"replaced_by":null,"website":"http://www.trace.tv/fr/tv/sport"},
  {"id":"TVPSport.pl","name":"TVP Sport","alt_names":[],"network":"TVP","owners":["Telewizja Polska"],"country":"PL","categories":["sports"],"is_nsfw":false,"launched":null,"closed":null,"replaced_by":null,"website":"https://sport.tvp.pl/"},
];

export const IPTV_STREAMS: Record<string, unknown>[] = [
  {"channel":"ACCDigitalNetwork.us","feed":"SD","title":"ACC Digital Network","url":"https://d53csymoczzde.cloudfront.net/ACC_Digital_Network.m3u8","quality":"1080p","labels":[],"user_agent":null,"referrer":null},
  {"channel":"ACCDigitalNetwork.us","feed":"SD","title":"ACC Digital Network","url":"https://amg01258-raycom-amg01258c6-vizio-us-2847.playouts.now.amagi.tv/playlist/amg01258-raycomsportsfast-accdigitalnetworkroku-vizious/playlist.m3u8","quality":"1080p","labels":["Geo-blocked"],"user_agent":null,"referrer":null},
  {"channel":"AntenaPlayEvents.ro","feed":"SD","title":"AntenaPlay Events","url":"https://live77cdn2.antenaplay.ro/live2_sdi03/live2_sdi03_3000k.m3u8","quality":"576p","labels":["Not 24/7"],"user_agent":null,"referrer":null},
  {"channel":"AntenaPlayEvents.ro","feed":"SD","title":"AntenaPlay Events","url":"https://live77cdn2.antenaplay.ro/live2_sdi09/live2_sdi09_2600k.m3u8","quality":"576p","labels":["Not 24/7"],"user_agent":null,"referrer":null},
  {"channel":"CRTVSportsandEntertainment.cm","feed":"SD","title":"CRTV Sports and Entertainment","url":"https://live1.acangroup.org:1929/publiclive/crtv_sport/playlist.m3u8","quality":"360p","labels":[],"user_agent":null,"referrer":"https://crtv.cm/live/crtv-sport"},
  {"channel":"DDSports.in","feed":"HD","title":"DD Sports HD","url":"https://cdn.pishow.tv/ott/live/1161/master.m3u8","quality":"1080p","labels":[],"user_agent":null,"referrer":null},
  {"channel":"DDSports.in","feed":"HD","title":"DD Sports HD","url":"https://fta.ektv.in/live/280/master.m3u8","quality":"1080p","labels":[],"user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36","referrer":null},
  {"channel":"DDSports.in","feed":"SD","title":"DD Sports","url":"https://cdn.pishow.tv/ott/live/13/master.m3u8","quality":"720p","labels":[],"user_agent":null,"referrer":null},
  {"channel":"FBTV.tr","feed":"SD","title":"FB TV","url":"http://1hskrdto.rocketcdn.com/fenerbahcetv.smil/playlist.m3u8","quality":"720p","labels":[],"user_agent":null,"referrer":null},
  {"channel":"France24.fr","feed":"English","title":"France 24 English","url":"https://live.france24.com/hls/live/2037218-b/F24_EN_HI_HLS/master_5000.m3u8","quality":"1080p","labels":[],"user_agent":null,"referrer":null},
  {"channel":"France24.fr","feed":"English","title":"France 24 English","url":"https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_5000.m3u8","quality":"1080p","labels":[],"user_agent":null,"referrer":null},
  {"channel":"Pac12Insider.us","feed":"SD","title":"Pac 12 Insider","url":"https://pac12-firetv.amagi.tv/playlist.m3u8","quality":"1080p","labels":[],"user_agent":null,"referrer":null},
  {"channel":"TraceSportStars.fr","feed":"HD","title":"Trace Sport Stars","url":"http://tracesportstars-samsunges.amagi.tv/hls/amagi_hls_data_samsunguk-tracesport-samsungspain/CDN/playlist.m3u8","quality":"1080p","labels":["Geo-blocked"],"user_agent":null,"referrer":null},
  {"channel":"TraceSportStars.fr","feed":"HD","title":"Trace Sport Stars","url":"https://channels.trace.plus/Traceprod/TRACE_SPORT_STARS_hd/index.m3u8","quality":"1080p","labels":[],"user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36","referrer":"https://trace.plus"},
  {"channel":"TVPSport.pl","feed":"SD","title":"TVP Sport","url":"rtsp://213.189.46.75/wmt-14963-1.sdp","quality":"1080p","labels":["Not 24/7"],"user_agent":null,"referrer":null},
  {"channel":null,"feed":null,"title":"Chaco TV","url":"https://wowzasrv.chaco.gov.ar/Streamtv/chacotv/playlist.m3u8","quality":"720p","labels":["Not 24/7"],"user_agent":null,"referrer":null},
  // HAND-WRITTEN (not from the API): a stream for a blocklisted channel.
  {"channel":"AstroArena.my","feed":"SD","title":"Astro Arena","url":"https://stream.example.invalid/astro-arena/index.m3u8","quality":"720p","labels":[],"user_agent":null,"referrer":null},
];

export const IPTV_BLOCKLIST: Record<string, unknown>[] = [
  {"channel":"ABEMASports.jp","reason":"dmca","ref":"https://github.com/github/dmca/blob/master/2020/09/2020-09-16-dfl.md"},
  {"channel":"AstroArena.my","reason":"dmca","ref":"https://github.com/iptv-org/iptv/issues/26363"},
];
