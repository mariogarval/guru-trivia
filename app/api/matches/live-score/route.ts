import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/matches/live-score?id=espn-12345
 * Returns real-time score, match minute, and status from ESPN.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("id");

  if (!matchId) {
    return NextResponse.json({ error: "Missing match id" }, { status: 400 });
  }

  // Extract ESPN event ID from our ID format (espn-12345 → 12345)
  const espnId = matchId.replace("espn-", "");

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${espnId}`,
      { cache: "no-store" } // Always fresh for live scores
    );

    if (!res.ok) {
      return NextResponse.json({ error: "ESPN API error" }, { status: 502 });
    }

    const data = await res.json();

    const competition = data?.header?.competitions?.[0];
    if (!competition) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const competitors = competition.competitors ?? [];
    const home = competitors.find((c: any) => c.homeAway === "home");
    const away = competitors.find((c: any) => c.homeAway === "away");

    const statusDetail = competition.status?.type?.detail ?? "";
    const statusName = competition.status?.type?.name ?? "STATUS_SCHEDULED";
    const clock = competition.status?.displayClock ?? "";
    const period = competition.status?.period ?? 0;

    let matchStatus: "scheduled" | "live" | "finished" = "scheduled";
    if (statusName === "STATUS_FINAL" || statusName === "STATUS_FULL_TIME") {
      matchStatus = "finished";
    } else if (
      statusName === "STATUS_IN_PROGRESS" ||
      statusName === "STATUS_HALFTIME" ||
      statusName === "STATUS_FIRST_HALF" ||
      statusName === "STATUS_SECOND_HALF"
    ) {
      matchStatus = "live";
    }

    return NextResponse.json({
      status: matchStatus,
      home_score: home?.score ?? "0",
      away_score: away?.score ?? "0",
      clock, // e.g. "67:23"
      period, // 1 or 2
      statusDetail, // e.g. "67' - 2nd Half", "Halftime", "Full Time"
      home_team: home?.team?.displayName ?? "",
      away_team: away?.team?.displayName ?? "",
    });
  } catch (err) {
    console.error("Live score fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
