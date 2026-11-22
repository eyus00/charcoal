import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Img from "../components/Img";
import { Empty } from "../components/PageHeader";
import { Pill } from "../components/Row";
import { Tip } from "../components/Tip";
import { btn } from "../components/Button";
import { epLabel } from "../lib/episodes";
import { imageUrl } from "../lib/images";
import { peekProps } from "../lib/peek";
import {
  downloadIcs,
  toggleReminder,
  useReminders,
  type Reminder,
} from "../lib/reminders";
import { useStore } from "../lib/store";
import {
  q,
  tmdb,
  type MediaItem,
  type MediaType,
  type Page,
} from "../lib/tmdb";
import { startTraktLogin, useTraktUser } from "../lib/trakt";
import {
  fetchMyCalendar,
  fetchPremieres,
  tImg,
  type CalendarEpisode,
} from "../lib/traktData";
import { cx, useTitle } from "../lib/util";

/** One thing on the calendar. */
interface Entry extends Reminder {
  type: MediaType;
  id: number;
  image?: string;
  badge?: string;
  minutes?: number;
}

type Tab = "mine" | "premieres" | "movies";
const DAY = 86_400_000;
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * What's airing and releasing, a week at a time: your shows (from Trakt when connected, else the
 * shows in your watchlist and history), series and season premieres, and new movies. Each entry
 * can get a reminder or be added to your own calendar.
 */
export default function Calendar() {
  useTitle("Calendar");
  const user = useTraktUser();
  const [tab, setTab] = useState<Tab>("mine");
  const [week, setWeek] = useState(0);
  const start = useMemo(
    () => new Date(startOfDay(new Date()).getTime() + week * 7 * DAY),
    [week],
  );
  const end = new Date(start.getTime() + 7 * DAY);

  const mine = useMyShows(start, tab === "mine", !!user);
  const premieres = useQuery({
    queryKey: ["trakt", "premieres", start.toDateString()],
    enabled: tab === "premieres",
    staleTime: 30 * 60_000,
    queryFn: () =>
      fetchPremieres(start, 7).then((rows) =>
        rows.map(episodeEntry).filter((e): e is Entry => !!e),
      ),
  });
  const movies = useQuery({
    queryKey: ["calendar-movies", start.toDateString()],
    enabled: tab === "movies",
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const page = await tmdb<Page<MediaItem>>("/discover/movie", {
        "primary_release_date.gte": iso(start),
        "primary_release_date.lte": iso(new Date(end.getTime() - DAY)),
        with_release_type: "2|3|4",
        sort_by: "popularity.desc",
      });
      return page.results
        .filter((m) => m.release_date && m.poster_path)
        .map(movieEntry);
    },
  });
  const active =
    tab === "mine" ? mine : tab === "premieres" ? premieres : movies;
  const entries = useMemo(
    () =>
      (active.data ?? [])
        .filter((e) => e.at >= start.getTime() && e.at < end.getTime())
        .sort((a, b) => a.at - b.at),
    [active.data, start, end],
  );
  const days = useMemo(() => {
    const byDay = new Map<number, Entry[]>();
    for (const e of entries) {
      const d = startOfDay(new Date(e.at)).getTime();
      byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }
    return [...byDay.entries()];
  }, [entries]);

  const range = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(end.getTime() - DAY).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-muted">
            New episodes, premieres and movies, with reminders.
          </p>
        </div>
        <div className="flex items-center justify-between gap-1 rounded-full bg-surface p-1 sm:justify-start">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeek((w) => w - 1)}
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeek(0)}
            className="h-9 min-w-36 rounded-full px-3 text-sm tabular-nums transition-colors hover:bg-white/10"
          >
            {week === 0 ? "This week" : range}
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeek((w) => w + 1)}
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["mine", "Your shows"],
            ["premieres", "Premieres"],
            ["movies", "Movies"],
          ] as const
        ).map(([k, label]) => (
          <Pill key={k} on={tab === k} onClick={() => setTab(k)}>
            {label}
          </Pill>
        ))}
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => downloadIcs(`Charcoal ${range}`, entries)}
            className={cx(btn(), "group/tip relative ml-auto")}
            aria-label="Add week to calendar"
          >
            <CalendarPlus className="size-4" />{" "}
            <span className="hidden sm:inline">Add week to calendar</span>
            <Tip
              label="Download this week as an .ics file"
              align="end"
              side="bottom"
            />
          </button>
        )}
      </div>

      {tab === "mine" && !user && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Showing shows from your watchlist and history. Connect Trakt to
            follow everything you watch.
          </p>
          <button
            type="button"
            onClick={() => startTraktLogin()}
            className={cx(btn(), "h-9 px-4 text-sm")}
          >
            Connect Trakt
          </button>
        </div>
      )}

      {active.isPending ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-5 w-40 rounded-md" />
              <div className="skeleton h-24 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : !days.length ? (
        <Empty
          icon={CalendarDays}
          title={
            tab === "mine"
              ? "Nothing from your shows this week"
              : "Nothing listed for this week"
          }
          body={
            tab === "mine"
              ? "Shows you watch or add to your watchlist show up here when new episodes air."
              : "Try the next week."
          }
        />
      ) : (
        <div className="space-y-7">
          {days.map(([d, list]) => (
            <section key={d}>
              <h2 className="mb-2.5 flex items-baseline gap-2 text-sm font-medium">
                {dayLabel(d)}
                <span className="text-xs font-normal text-faint">
                  {list.length}
                </span>
              </h2>
              <div className="grid gap-2 lg:grid-cols-2">
                {list.map((e) => (
                  <EntryRow key={e.key} e={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function dayLabel(d: number) {
  const today = startOfDay(new Date()).getTime();
  if (d === today) return "Today";
  if (d === today + DAY) return "Tomorrow";
  return new Date(d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function EntryRow({ e }: { e: Entry }) {
  const reminders = useReminders();
  const on = reminders.some((r) => r.key === e.key);
  const past = e.at < Date.now();
  const time = e.allDay
    ? "All day"
    : new Date(e.at).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
  return (
    <div className="group flex min-w-0 items-center gap-2 rounded-2xl bg-surface p-2 pr-2 sm:gap-3 sm:pr-3 transition-colors hover:bg-raised/70">
      <Link
        to={`/${e.type}/${e.id}`}
        {...peekProps(e.type, e.id)}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span
          className={cx(
            "relative shrink-0 overflow-hidden rounded-xl bg-white/5",
            e.type === "movie" ? "w-12 sm:w-14" : "w-24 sm:w-32",
          )}
        >
          <Img
            path={null}
            src={e.image}
            kind="still"
            sizes="128px"
            alt=""
            className={e.type === "movie" ? "aspect-[2/3]" : "aspect-video"}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{e.title}</span>
            {e.badge && (
              <span className="shrink-0 rounded-full bg-white px-2 py-px text-micro font-medium text-black">
                {e.badge}
              </span>
            )}
          </span>
          {e.body && (
            <span className="block truncate text-xs text-muted">{e.body}</span>
          )}
          <span className="block text-xs text-faint tabular-nums">{time}</span>
        </span>
      </Link>
      {!past && (
        <button
          type="button"
          onClick={() => toggleReminder(e)}
          aria-pressed={on}
          aria-label={on ? "Remove reminder" : "Remind me"}
          className={cx(
            "group/tip relative grid size-9 shrink-0 place-items-center rounded-full transition-colors",
            on
              ? "bg-white text-black"
              : "text-muted hover:bg-white/10 hover:text-white",
          )}
        >
          {on ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          <Tip label={on ? "Reminder on" : "Remind me"} align="end" />
        </button>
      )}
      <button
        type="button"
        onClick={() =>
          downloadIcs(e.body ? `${e.title} ${e.body}` : e.title, [e])
        }
        aria-label="Add to calendar"
        className="group/tip relative grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
      >
        <CalendarPlus className="size-4" />
        <Tip label="Add to calendar (.ics)" align="end" />
      </button>
    </div>
  );
}

function episodeEntry(c: CalendarEpisode): Entry | null {
  const id = c.show.ids.tmdb;
  if (!id || !c.first_aired) return null;
  const ep = c.episode;
  return {
    key: `tv-${id}-${ep.season}-${ep.number}`,
    type: "tv",
    id,
    title: c.show.title,
    body: `${epLabel(ep.season, ep.number)}${ep.title ? ` · ${ep.title}` : ""}`,
    at: Date.parse(c.first_aired),
    url: `/watch/tv/${id}?season=${ep.season}&episode=${ep.number}`,
    image:
      tImg(ep.images?.screenshot) ??
      tImg(c.show.images?.fanart) ??
      tImg(c.show.images?.thumb),
    badge:
      ep.number === 1
        ? ep.season === 1
          ? "Series premiere"
          : "Season premiere"
        : undefined,
  };
}

function movieEntry(m: MediaItem): Entry {
  return {
    key: `movie-${m.id}`,
    type: "movie",
    id: m.id,
    title: m.title ?? "",
    body: "Release",
    at: new Date(`${m.release_date}T00:00:00`).getTime(),
    allDay: true,
    url: `/movie/${m.id}`,
    image: imageUrl(m.poster_path, "poster", 185) ?? undefined,
    minutes: 120,
  };
}

/**
 * Your shows' new episodes: Trakt's "my shows" calendar when connected; otherwise the next episode
 * of each show in your watchlist and history (from TMDB).
 */
function useMyShows(start: Date, enabled: boolean, connected: boolean) {
  const trakt = useQuery({
    queryKey: ["trakt", "my-calendar", start.toDateString()],
    enabled: enabled && connected,
    staleTime: 10 * 60_000,
    queryFn: () =>
      fetchMyCalendar(start, 7).then((rows) =>
        rows.map(episodeEntry).filter((e): e is Entry => !!e),
      ),
  });
  const watchlist = useStore((s) => s.watchlist);
  const history = useStore((s) => s.history);
  const ids = useMemo(
    () =>
      [
        ...new Set([
          ...watchlist
            .filter((w) => w.mediaType === "tv" && w.status !== "completed")
            .map((w) => w.id),
          ...history.filter((h) => h.mediaType === "tv").map((h) => h.id),
        ]),
      ].slice(0, 30),
    [watchlist, history],
  );
  const shows = useQueries({
    queries: ids.map((id) => ({
      ...q.details("tv", id),
      enabled: enabled && !connected,
    })),
  });
  if (connected) return trakt;
  const data = shows.flatMap((r): Entry[] => {
    const d = r.data;
    const n = d?.next_episode_to_air;
    if (!d || !n?.air_date) return [];
    return [
      {
        key: `tv-${d.id}-${n.season_number}-${n.episode_number}`,
        type: "tv",
        id: d.id,
        title: d.name ?? "",
        body: `${epLabel(n.season_number, n.episode_number)}${n.name ? ` · ${n.name}` : ""}`,
        at: new Date(`${n.air_date}T00:00:00`).getTime(),
        allDay: true,
        url: `/watch/tv/${d.id}?season=${n.season_number}&episode=${n.episode_number}`,
        image:
          imageUrl(n.still_path ?? d.backdrop_path, "still", 300) ?? undefined,
        badge:
          n.episode_number === 1
            ? n.season_number === 1
              ? "Series premiere"
              : "Season premiere"
            : undefined,
      },
    ];
  });
  return {
    data,
    isPending: shows.some((r) => r.isPending) && enabled && ids.length > 0,
  };
}
