# Provider addresses: cloud-2026-11-24

Checked from a data-centre address (cloud sandbox behind an HTTPS egress proxy). DNS is asked over HTTPS (public resolvers), so it is what the world sees, not what one machine resolves.

| Provider | Role | Address | DNS | Answer | Verdict |
|---|---|---|---|---|---|
| castle | api (active) | api.hlowb.com | ok | 200 | answers |
| vixsrc | site (active) | vixsrc.to | ok | 403 | `CHALLENGE`: vixsrc.to answers with a browser check from this network |
| febbox | showbox (active) | www.showbox.media | ok | 200 | answers |
| febbox | febbox (active) | www.febbox.com | ok | 200 | answers |
| cinesu | site (active) | cine.su | ok | 403 → koddo.to | `REDIRECTED`: cine.su now sends visitors to koddo.to |
| icefy | site (active) | streams.icefy.top | ok | 403 | `CHALLENGE`: streams.icefy.top answers with a browser check from this network |
| fsharetv | site (active) | fsharetv.cc | ok | – | `CONNECT`: fsharetv.cc resolves (104.219.250.37) but: couldn’t connect to it |
| popr | site (active) | popr.ink | ok | – | `CONNECT`: popr.ink resolves (104.219.250.37) but: couldn’t connect to it |
| streammafia | site (active) | player.nhdapi.com | ok | – | `CONNECT`: player.nhdapi.com resolves (143.246.43.101) but: couldn’t connect to it |
| vidrock | site (active) | vidrock.net | ok | 200 | answers |
| vidrock | subs (active) | sub.vdrk.site | ok | 200 | answers |
| vidsrc | site (active) | vsembed.ru | ok | 200 | answers |
| vidzee | api (active) | core.vidzee.wtf | ok | 404 | answers |
| vidzee | player (active) | player.vidzee.wtf | ok | 200 | answers |
| vidnest | site (active) | vidnest.fun | ok | 200 | answers |
| vidnest | api (active) | new.vidnest.fun | ok | 403 | `ACCESS_DENIED`: new.vidnest.fun refuses this network (HTTP 403) |
| videasy | api (active) | api.wecollege.net | ok | 403 | `ACCESS_DENIED`: api.wecollege.net refuses this network (HTTP 403) |
| videasy | player (active) | vidy.st | ok | 200 | answers |
| videasy | decoder (active) | enc-dec.app | ok | 200 | answers |
| tulnex | api (active) | api.tulnex.com | nxdomain | – | `DNS`: The name api.tulnex.com no longer exists in DNS |
| peachify | site (active) | peachify.top | ok | 403 | `CHALLENGE`: peachify.top answers with a browser check from this network |
| peachify | api (active) | usa.eat-peach.sbs | nxdomain | – | `DNS`: The name usa.eat-peach.sbs no longer exists in DNS |
| peachify | moviebox (active) | uwu.eat-peach.sbs | nxdomain | – | `DNS`: The name uwu.eat-peach.sbs no longer exists in DNS |
