/**
 * What Sports' Schedule and Channels pages offer. This file is configuration, kept by whoever
 * operates the site: which sports and competitions the schedule lists, which public channels may
 * play in Charcoal's player, and where each competition's official "how to watch" page is.
 * (Live events come from the stream directory instead: see lib/sports.)
 */
import type { LinkoutTable } from '@charcoal/content';

export interface SportTab {
  key: string;
  label: string;
  /** The sport's name as TheSportsDB spells it (its `s=` parameter). */
  sport: string;
  /** TheSportsDB league ids whose next fixtures are asked for (names checked with lookupleague.php on 2026-11-24). */
  leagues: string[];
}

export const SPORTS: SportTab[] = [
  // 4328 English Premier League, 4335 Spanish La Liga, 4480 UEFA Champions League, 4331 German Bundesliga
  { key: 'football', label: 'Football', sport: 'Soccer', leagues: ['4328', '4335', '4480', '4331'] },
  // 4460 Indian Premier League
  { key: 'cricket', label: 'Cricket', sport: 'Cricket', leagues: ['4460'] },
  // 4387 NBA
  { key: 'basketball', label: 'Basketball', sport: 'Basketball', leagues: ['4387'] },
  // 4391 NFL
  { key: 'american-football', label: 'American football', sport: 'American Football', leagues: ['4391'] },
  // 4370 Formula 1, 4407 MotoGP
  { key: 'motorsport', label: 'Motorsport', sport: 'Motorsport', leagues: ['4370', '4407'] },
  // 4464 ATP World Tour
  { key: 'tennis', label: 'Tennis', sport: 'Tennis', leagues: ['4464'] },
  // 4380 NHL
  { key: 'ice-hockey', label: 'Ice hockey', sport: 'Ice Hockey', leagues: ['4380'] },
  // 4424 MLB
  { key: 'baseball', label: 'Baseball', sport: 'Baseball', leagues: ['4424'] },
];

/**
 * iptv-org channel ids that may be played here: sports channels that are free to air where they
 * are broadcast (public and state broadcasters, free commercial channels) or that their owner
 * streams for free itself.
 *
 * iptv-org's list has no "free to air" field and also carries subscription channels (ESPN, beIN
 * Sports, Eurosport, NFL Network, …), so nothing plays unless it is named here. To offer another
 * channel, check that it really is free to air and add its id (the `id` in channels.json).
 * Last reviewed against channels.json on 2026-11-24.
 */
export const FREE_TO_AIR_CHANNELS: ReadonlySet<string> = new Set([
  // Public and state broadcasters
  'DDSports.in', // Prasar Bharati (India)
  'TRTSpor.tr', // TRT (Türkiye)
  'TRTSporYildiz.tr',
  'ORFSportPlus.at', // ORF (Austria)
  'Teledeporte.es', // RTVE (Spain)
  'Esport3.es', // Televisió de Catalunya
  'LRTPlius.lt', // LRT (Lithuania)
  'TVRSport.ro', // TVR (Romania)
  'SanMarinoRTVSport.sm', // San Marino RTV
  'PTVSports.pk', // Pakistan Television Corporation
  'QazSport.kz', // Kazakhstan
  'MNBSport.mn', // Mongolian National Broadcaster
  'KTVSport.kw', // Kuwait Ministry of Information
  'KTVSportPlus.kw',
  'BahrainSports1.bh', // Bahrain Radio and Television Corporation
  'BahrainSports2.bh',
  'OmanSportsTV.om', // Oman
  'JordanSport.jo', // Jordan
  'SharjahSports.ae', // Sharjah Broadcasting Authority
  'AlIraqiaSport.iq', // Iraqi Media Network
  // Free commercial channels
  'LEquipe.fr', // free on French terrestrial TV
  'Sport1.de', // free on German TV
  'Sportitalia.it', // free on Italian terrestrial TV
  'ASpor.tr', // free on Turkish TV
  'RealMadridTV.es', // free on Spanish terrestrial TV
  // Free channels streamed by their owners
  'RedBullTV.at', // Red Bull Media House
  'FIFAPlus.uk', // FIFA
  'FIFAPlusWomen.uk',
  'OlympicChannel.es', // IOC
  'EurovisionSport.uk', // European Broadcasting Union
  'CBSSportsHQ.us', // CBS Sports' free news channel
  'CBSSportsGolazoNetwork.us',
  'NBCSportsNOW.us',
  'ACCDigitalNetwork.us',
  'Stadium.us',
  'beINSPORTSXTRA.us', // beIN's free channel (not its subscription channels)
]);

/**
 * Where to watch a competition officially, keyed by TheSportsDB league id. Each link is the
 * competition's own page or streaming service (addresses checked on 2026-11-24). Region "WW" =
 * shown to everyone; add entries with a country code for a national broadcaster.
 */
export const OFFICIAL_LINKOUTS: LinkoutTable = {
  '4328': [{ region: 'WW', rightsHolder: 'Premier League: broadcasters by country', url: 'https://www.premierleague.com/en/media/broadcasters' }],
  '4335': [{ region: 'WW', rightsHolder: 'LALIGA: where to watch', url: 'https://www.laliga.com/en-GB/where-to-watch-laliga-easports' }],
  '4480': [{ region: 'WW', rightsHolder: 'UEFA.tv', url: 'https://www.uefa.tv/' }],
  '4460': [{ region: 'WW', rightsHolder: 'IPL official site', url: 'https://www.iplt20.com/' }],
  '4387': [{ region: 'WW', rightsHolder: 'NBA: ways to watch', url: 'https://www.nba.com/watch' }],
  '4391': [{ region: 'WW', rightsHolder: 'NFL: ways to watch', url: 'https://www.nfl.com/ways-to-watch' }],
  '4380': [{ region: 'WW', rightsHolder: 'NHL: how to watch', url: 'https://www.nhl.com/info/how-to-watch-and-stream-nhl-games' }],
  '4424': [{ region: 'WW', rightsHolder: 'MLB.TV', url: 'https://www.mlb.com/live-stream-games' }],
  '4370': [{ region: 'WW', rightsHolder: 'F1 TV', url: 'https://f1tv.formula1.com/' }],
  '4407': [{ region: 'WW', rightsHolder: 'MotoGP VideoPass', url: 'https://www.motogp.com/en/videopass' }],
  '4464': [{ region: 'WW', rightsHolder: 'Tennis TV (ATP)', url: 'https://www.tennistv.com/' }],
};
