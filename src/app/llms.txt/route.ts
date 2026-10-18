import {
  getCommunityDb,
  isCommunityConfigured,
  PLAN_SUMMARY_COLUMNS,
  type PlanRow,
} from "@/lib/server/community";
import { describePlanRow } from "@/lib/server/plan-preview";
import { APP_VERSION } from "@/lib/version";

/**
 * The site as one page of markdown for language-model crawlers (the llms.txt
 * convention), which run no JavaScript and so see the planner as an empty
 * page. Top shared plans are linked because each plan URL server-renders its
 * name and summary into metadata.
 */
export const revalidate = 3600;

async function topPlans(base: string): Promise<string[]> {
  if (!isCommunityConfigured()) {
    return [];
  }
  try {
    const { data } = await getCommunityDb()
      .from("community_plans")
      .select(PLAN_SUMMARY_COLUMNS)
      .or("is_public.eq.true,is_public.is.null")
      .order("score", { ascending: false })
      .limit(10)
      .returns<PlanRow[]>();
    // An author's description can span lines; a link list entry cannot.
    return (data ?? []).map(
      (row) =>
        `- [${row.name}](${base}/?plan=${encodeURIComponent(row.id)}): ${describePlanRow(row).replace(/\s+/g, " ")}`,
    );
  } catch {
    return [];
  }
}

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const plans = await topPlans(base);

  const lines = [
    "# Monifactory Planner",
    "",
    "> Browser-based recipe browser and production-chain planner for Monifactory. Draw factory layouts on an interactive flowchart.",
    "",
    "Key facts:",
    "",
    "- Includes recipes exported from Monifactory 0.13.7 Normal mode. Some recipes have unknown processing rates.",
    "- Machine counts and power calculations are still being adapted for Monifactory.",
    "- Plans export as shareable links, JSON, PNG, or GIF. Opening a shared link loads the full plan, editable, with nothing to sign up for.",
    "- The planner is a client-side application. Pages carry little static HTML; a plan link's name and summary are server-rendered into its page metadata, so fetching a plan URL is the way to read a plan.",
    `- Version ${APP_VERSION} as of this file; ${base}/api/version reports what is live.`,
    "",
    "## Start here",
    "",
    `- [The planner](${base}/): the app itself. Everything happens on one page.`,
    `- [Sitemap](${base}/sitemap.xml): the home page plus every public community plan.`,
    "",
  ];

  if (plans.length > 0) {
    lines.push("## Popular community plans", "", ...plans, "");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
