import { AGENT_REPORTED, coverageNote, SCORE_PAUSED, STILL_LEARNING, S } from "@/lib/strings";
import { MIN_SCORED_VERDICTS } from "@/lib/scoring/config";
import { tomatoFor } from "@/lib/scoring/verdict";
import { StatusIcon, Tag } from "./ui";

// The Adherence score (spec 6.6, 11.4), drawn as the design's score card: a still tomato picture, the number, a WORD label (never color alone), the
// "Agent-reported" tag and the coverage note (FR-F6, FR-F7). A ripe tomato is exactly as verified as the number beside it. The tomato is a still
// picture in one of a few fixed ripeness stages; no animation. The stage WORDS are Lia's decision O2, set C (see scoring/config.ts).
// The freshness meter is kept (the design dropped it from Home, question Q3; the owner has not said it should go).

export interface ScoreCardProps {
  percent: number | null;
  scored: number;
  tasksLogged: number;
  freshnessPercent: number | null;
  paused: boolean;
  needsAnswer: number;
}

const TOMATO_IMAGE = ["tomato-1-green", "tomato-2-yellow-green", "tomato-3-amber", "tomato-4-red", "tomato-5-crimson"];

export function ScoreCard({ percent, scored, tasksLogged, freshnessPercent, paused, needsAnswer }: ScoreCardProps) {
  const tomato = percent === null ? null : tomatoFor(percent);
  return (
    <section className="score-card" aria-label="How your agents are doing">
      <p className="score-lead">{percent === null ? "Your agents have not logged enough tasks for a score yet" : "Your agents say they followed your instructions"}</p>
      {paused ? <p role="status">{SCORE_PAUSED}</p> : null}
      <div className="score-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/${tomato ? TOMATO_IMAGE[tomato.stageIndex] : "tomato-0-still-learning"}.png`} alt="" aria-hidden="true" width={112} height={112} />
        <div className="stack stack-1">
          {percent === null ? (
            <>
              <span className="score-number">{"–"}</span>
              <Tag strong>{STILL_LEARNING.split(".")[0]}</Tag>
              <span className="caption">
                {scored} of {MIN_SCORED_VERDICTS} checks so far.
              </span>
            </>
          ) : (
            <>
              <span className="score-number" role="img" aria-label={`${percent}%`}>
                {percent}
                <small>%</small>
              </span>
              <span className="score-sub">of the time</span>
              <Tag strong>{tomato!.label}</Tag>
            </>
          )}
        </div>
      </div>
      <div className="row">
        <span className="tag">
          <StatusIcon kind="outline" />
          {S.agentReported}
        </span>
      </div>
      <p className="score-note">
        Adherence score, {AGENT_REPORTED}: of the checks that could be decided in the last 14 days, how many your agents told us they followed. {coverageNote(tasksLogged)}
      </p>
      {needsAnswer > 0 ? (
        <p>
          <a className="link" href="/feed?unreviewed=1">
            {needsAnswer} {needsAnswer === 1 ? "check needs" : "checks need"} your answer
          </a>
        </p>
      ) : null}
      <div className="stack stack-2 rule-above">
        <span className="eyebrow">Freshness</span>
        {freshnessPercent === null ? (
          <span className="caption">add a few details to see this.</span>
        ) : (
          <>
            <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={freshnessPercent} aria-label="Details reviewed in the last 90 days">
              <i style={{ width: `${freshnessPercent}%` }} />
            </div>
            <span className="caption">
              <strong>{freshnessPercent}%</strong> of your details were checked in the last 90 days.
            </span>
          </>
        )}
      </div>
    </section>
  );
}
