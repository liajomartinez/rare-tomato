import Link from "next/link";
import { S } from "@/lib/strings";
import { Logo, Sticker, Tag } from "../ui";

// The first screen for someone who is signed out (SPEC A1). One primary: create an account. A quiet link: sign in.
// On a wide screen the tomato picture and the example sit beside the headline, and the three points sit in a row.

export function Landing() {
  const L = S.onb.landing;
  const hero = (
    <div className="stack stack-5">
      <h1 className="hero-title">{L.headline}</h1>
      <p className="hero-lead">
        {L.sub}
      </p>
      <div className="stack stack-1">
        <Link href="/start/account" prefetch={false} className="btn btn-primary btn-block">
          {L.start}
        </Link>
        <div style={{ textAlign: "center" }}>
          <Link href="/sign-in" prefetch={false} className="btn btn-quiet">
            {L.signIn}
          </Link>
        </div>
      </div>
    </div>
  );
  const example = (
    <section className="stack stack-2" aria-label={L.example}>
      <div>
        <Sticker>{L.example}</Sticker>
      </div>
      <p className="rule-text">{L.exampleRule}</p>
      <div className="row row-tight">
        <span aria-hidden="true">{"→"}</span>
        {L.chips.map((c) => (
          <Tag key={c}>{c}</Tag>
        ))}
      </div>
    </section>
  );
  return (
    <>
      <header className="appbar">
        <Link href="/" prefetch={false} className="appbar-logo">
          <Logo />
        </Link>
      </header>
      <main className="landing-page">
        <div className="hero-grid">
          {hero}
          <div className="stack stack-5">
            <div className="only-wide" style={{ alignSelf: "center", textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tomato-4-red.png" alt="" aria-hidden="true" width={200} height={200} />
            </div>
            {example}
          </div>
        </div>
        <div className="landing-points hide-wide">
          {L.points.map(([h, b], i) => (
            <div key={h}>
              <span aria-hidden="true" className="numeral">
                {i + 1}
              </span>
              <div className="stack stack-1">
                <b>{h}</b>
                <span className="caption">{b}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="points-wide only-wide">
          {L.points.map(([h, b]) => (
            <div key={h}>
              <b style={{ font: "var(--font-h3)" }}>{h}</b>
              <span className="caption">{b}</span>
            </div>
          ))}
        </div>
        <p className="trust-copy">
          <b>{L.limitsLead}</b>
          {L.limits}
        </p>
        <nav className="row" aria-label="Legal">
          <Link href="/privacy" prefetch={false} className="link">
            {L.privacy}
          </Link>
          <Link href="/terms" prefetch={false} className="link">
            {L.terms}
          </Link>
        </nav>
      </main>
    </>
  );
}
