import Link from "next/link";
import { MIN_REPORTED_TASKS } from "@/lib/scoring/config";
import { tomatoFor } from "@/lib/scoring/verdict";
import { SCORE_PAUSED, S } from "@/lib/strings";
import { StatusIcon, Tag } from "./ui";

// One agent's rule-following card, as designed (SPEC B5): "[Agent]'s rule following", a still tomato, the number and a WORD label (never color
// alone), the "Agent-reported" tag and "Based on N reported tasks." (FR-F6, FR-F7). Until an agent has reported 5 tasks (or too few of them could be
// checked) it says "Still learning" with no number. A ripe tomato is exactly as reliable as the number beside it: both are what the agent reported.
// The tomato is a still picture in one of a few fixed ripeness stages; no animation. The button is secondary because Home already has a primary.
// The stage WORDS are the owner's decision O2, set C (strings.ts).

export interface ScoreCardProps {
  agentName: string;
  /** null = not enough checks to show a number. */
  percent: number | null;
  /** Tasks this agent reported in the last 14 days. */
  reportedTasks: number;
  paused: boolean;
  needsAnswer: number;
}

const TOMATO_IMAGE = ["tomato-1-green", "tomato-2-yellow-green", "tomato-3-amber", "tomato-4-red", "tomato-5-crimson"];

export function ScoreCard({ agentName, percent, reportedTasks, paused, needsAnswer }: ScoreCardProps) {
  const learning = percent === null || reportedTasks < MIN_REPORTED_TASKS;
  const tomato = learning ? null : tomatoFor(percent);
  return (
    <section className="score-card" aria-label={S.score.title(agentName)}>
      <h2 style={{ font: "var(--font-h3)" }}>{S.score.title(agentName)}</h2>
      {paused ? <p role="status">{SCORE_PAUSED}</p> : null}
      <div className="score-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/brand/${tomato ? TOMATO_IMAGE[tomato.stageIndex] : "tomato-0-still-learning"}.png`}
          alt=""
          aria-hidden="true"
          width={tomato ? 96 : 56}
          height={tomato ? 96 : 56}
        />
        <div className="stack stack-1">
          {learning ? (
            <>
              <div>
                <Tag strong>{S.score.learning}</Tag>
              </div>
              <span className="caption">{S.score.need(reportedTasks)}</span>
            </>
          ) : (
            <>
              <span className="score-number" role="img" aria-label={`${percent}%`}>
                {percent}
                <small>%</small>
              </span>
              <div>
                <Tag strong>{tomato!.label}</Tag>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="row row-tight">
        <span className="tag">
          <StatusIcon kind="outline" />
          {S.agentReported}
        </span>
        {learning ? null : <span className="caption">{S.score.based(reportedTasks)}</span>}
      </div>
      {needsAnswer > 0 ? (
        <p>
          <a className="link" href="/feed?unreviewed=1">
            {needsAnswer} {needsAnswer === 1 ? "check needs" : "checks need"} your answer
          </a>
        </p>
      ) : null}
      <div className="stack stack-2 rule-above">
        <Link href="/feed?unreviewed=1" prefetch={false} className="btn btn-block">
          {S.score.cta}
        </Link>
        <details>
          <summary>{S.score.how}</summary>
          <p className="caption">{S.score.howNote}</p>
        </details>
      </div>
    </section>
  );
}
