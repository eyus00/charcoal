/**
 * Which public channels may play in Charcoal's player: configuration, kept by whoever operates the site.
 */

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
