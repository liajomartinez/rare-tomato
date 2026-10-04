import { AGENT_REPORTED, coverageNote, SCORE_PAUSED, STILL_LEARNING } from "@/lib/strings";
import { MIN_SCORED_VERDICTS } from "@/lib/scoring/config";
import { tomatoFor } from "@/lib/scoring/verdict";
import { card, muted } from "./ui";

// The Adherence score and the Freshness meter (spec 6.6, 11.4). Every appearance of the score carries the percentage, a WORD label (never color
// alone), the "agent-reported" label and the coverage note (FR-F6, FR-F7). A ripe tomato is exactly as verified as the number beside it.
// The tomato is a still shape in one of a few fixed colors; no animation. The stage WORDS are Lia's open decision O2 (see scoring/config.ts).

export interface ScoreCardProps {
  percent: number | null;
  scored: number;
  tasksLogged: number;
  freshnessPercent: number | null;
  paused: boolean;
  needsAnswer: number;
}

function Tomato({ fill }: { fill: string }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle cx="22" cy="25" r="16" fill={fill} stroke="#17172b" strokeWidth="2" />
      <path d="M22 9 L18 3 M22 9 L22 2 M22 9 L26 3" stroke="#2d6a4f" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ScoreCard({ percent, scored, tasksLogged, freshnessPercent, paused, needsAnswer }: ScoreCardProps) {
  const tomato = percent === null ? null : tomatoFor(percent);
  return (
    <section style={card} aria-label="How your agents are doing">
      <h2>How your agents are doing</h2>
      {paused ? <p role="status">{SCORE_PAUSED}</p> : null}
      {percent === null ? (
        <p>
          {STILL_LEARNING} <span style={muted}>({scored} of {MIN_SCORED_VERDICTS} checks so far.)</span>
        </p>
      ) : (
        <p style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "1.25rem" }}>
          <Tomato fill={tomato!.fill} />
          <strong>
            {percent}% &mdash; {tomato!.label}
          </strong>
        </p>
      )}
      <p style={muted}>
        Adherence score, {AGENT_REPORTED}: of the checks that could be decided in the last 14 days, how many your agents told us they followed. {coverageNote(tasksLogged)}
      </p>
      {needsAnswer > 0 ? (
        <p>
          <a href="/feed?unreviewed=1">
            {needsAnswer} {needsAnswer === 1 ? "check needs" : "checks need"} your answer
          </a>
        </p>
      ) : null}
      <p>
        Freshness:{" "}
        {freshnessPercent === null ? (
          <span style={muted}>add a few details to see this.</span>
        ) : (
          <>
            <progress value={freshnessPercent} max={100} aria-label="Details reviewed in the last 90 days" /> <strong>{freshnessPercent}%</strong>{" "}
            <span style={muted}>of your details were checked in the last 90 days.</span>
          </>
        )}
      </p>
    </section>
  );
}
