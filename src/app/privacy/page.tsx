import Link from "next/link";
import {
  ADULTS_WORLDWIDE, AGENT_MEMORY_NOTE, CONTACT_LINE, COOKIE_ROWS, COOKIES_PUBLIC, COOKIES_WORKOS, NOT_END_TO_END, OPERATOR_LINE, OTHER_PEOPLE_STATEMENT, PROVIDED_AS_IS,
  RUNS_IN_US, SCORE_ORIGIN, SENSITIVE_READERS_NOTE, TERMS_EFFECTIVE_DATE,
} from "@/lib/strings";
import { muted, page } from "../ui";

// What Rare Tomato stores, who processes it, and what we do and do not control. It states what the product does TODAY and says plainly what we have not
// confirmed with a provider. It never calls the blocked-data check a guarantee, never says rules are enforced, and never says a score is verified.
// The shared wording lives in src/lib/strings.ts.

export const metadata = { title: "Rare Tomato Privacy Notice" };

const th = { textAlign: "left", borderBottom: "var(--line-ink)", padding: "0.4rem", verticalAlign: "top" } as const;
const td = { borderBottom: "var(--line-card)", padding: "0.4rem", verticalAlign: "top" } as const;
const NOT_FIELD_ENCRYPTED = "Not encrypted at the application field level.";

export default function Privacy() {
  return (
    <main style={page}>
      <h1>Rare Tomato Privacy Notice</h1>
      <p style={muted}>
        Effective date: {TERMS_EFFECTIVE_DATE}. {OPERATOR_LINE} {CONTACT_LINE}
      </p>
      <p>
        <strong>In short.</strong> Rare Tomato keeps a short list of details you choose to share about how you like things done, and lets the AI agents you connect read
        them. It also keeps a record of what those agents tell it they did, and the rules you save for them. We try to keep this small. We cannot control what an agent
        does once it has read something, and this notice says where our control ends.
      </p>
      <p>
        <strong>Who this covers.</strong> Visitors to this site, people with an account, and people whose information is added by a user or by an agent. The AI providers
        you connect (such as Claude, ChatGPT, Grok Bot or Muse) and the Claude service we use are independent companies with their own notices. This notice covers what
        Rare Tomato does. {ADULTS_WORLDWIDE} {PROVIDED_AS_IS} Reports and comparisons shown here can be inaccurate.
      </p>

      <h2>1. What we store</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>What</th>
            <th style={th}>How it is stored</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>Your sign-in email and sign-in identifier; that you confirmed you are an adult; the Terms version you accepted and when</td>
            <td style={td}>In our database. {NOT_FIELD_ENCRYPTED}</td>
          </tr>
          <tr>
            <td style={td}>Your details (preferences, contacts, family details)</td>
            <td style={td}>
              The detail itself is encrypted at the field level. Its short label, its category, any Sensitive label and the list of agents you chose for it are not.
            </td>
          </tr>
          <tr>
            <td style={td}>Your agents: the name you gave each, what kind it is, what it may read, when it last connected</td>
            <td style={td}>{NOT_FIELD_ENCRYPTED}</td>
          </tr>
          <tr>
            <td style={td}>Authorization and consent records: an identifier from each agent&apos;s sign-in and, only where a token is used, a one-way hash of it (never the token); your acceptance of the Terms</td>
            <td style={td}>{NOT_FIELD_ENCRYPTED}</td>
          </tr>
          <tr>
            <td style={td}>What agents tell us they did (task records)</td>
            <td style={td}>
              The summary and the optional details are encrypted at the field level. The kind of task, the outcome, the time and which agent are not. These are what the
              agent reported; we do not check them.
            </td>
          </tr>
          <tr>
            <td style={td}>Your feedback on a task</td>
            <td style={td}>The note is encrypted at the field level. The thumbs up or down and the reasons you chose are not.</td>
          </tr>
          <tr>
            <td style={td}>Your rules and their history</td>
            <td style={td}>{NOT_FIELD_ENCRYPTED} Only rules you save are shown to agents.</td>
          </tr>
          <tr>
            <td style={td}>Generated rule drafts</td>
            <td style={td}>
              After a thumbs-down we draft a rule. It is kept, not field-encrypted and never shown to any agent, until you save it, tap Not now (which deletes it), or about 30
              minutes pass (it is then deleted).
            </td>
          </tr>
          <tr>
            <td style={td}>How each task compared with your rules (the check result)</td>
            <td style={td}>
              {NOT_FIELD_ENCRYPTED} The verdict, which check gave it and when. {SCORE_ORIGIN}
            </td>
          </tr>
          <tr>
            <td style={td}>A record of what agents asked for (which agent, which tool, when, which kinds of detail)</td>
            <td style={td}>{NOT_FIELD_ENCRYPTED} It never contains the details themselves. You can see it on Settings and data.</td>
          </tr>
          <tr>
            <td style={td}>Request and connection data our host records</td>
            <td style={td}>
              Our hosting provider (Vercel) records technical information about requests, such as the time, the page and the result, for a short time. We have not confirmed
              everything it records or for how long. Our own code does not write your details to logs. If a server error happens, the host&apos;s logs may hold technical text
              from the failed request, which can include readable fields such as a detail&apos;s short label or a rule&apos;s wording (encrypted fields appear only in encrypted
              form).
            </td>
          </tr>
          <tr>
            <td style={td}>Support emails</td>
            <td style={td}>If you email support@raretomato.ai, we keep your message and our reply in our mailbox.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Labels, categories, rules, rule history and feedback reasons are not encrypted at the field level and can still reveal personal information. Your details, task
        summaries and details, and notes are encrypted at the field level. Our servers can decrypt them to run the service and to give them to agents you allow.{" "}
        {NOT_END_TO_END} No security measure removes every risk.
      </p>

      <h2>2. Where information comes from and what we use it for</h2>
      <p>
        <strong>Where it comes from:</strong> you; agents you authorize; and our sign-in provider. You may add information about household members or contacts, and agents may
        mention people in the task reports they send us.
      </p>
      <p>
        <strong>What we use it for:</strong> sign-in and access; sharing the features you ask for with the agents you allow; activity history, rule suggestions and comparisons;
        security and operation of the service; and support.
      </p>

      <h2>3. Sensitive information</h2>
      <p>
        Please do not enter government ID numbers, card or bank details, passwords, insurance or medical record IDs, test results or clinical documents. When you save
        something, an automatic check runs inside our own service and turns away text that matches obvious patterns of these. It also warns about words that suggest a health
        condition or your own finances.{" "}
        <strong>The check is best-effort. It can miss things and it can flag harmless text.</strong> A Sensitive label is a prompt, not a guarantee. The same turn-away check runs
        on rule text, notes and agents&apos; task records. The text you enter is not sent to an outside provider for this check.
      </p>
      <p>
        You may add optional health details, such as an allergy or a medication reminder. They are labeled Sensitive and are shown only to the agents you choose, and you can
        delete them any time. {SENSITIVE_READERS_NOTE} We do not provide a specialized health-data consent process. {OTHER_PEOPLE_STATEMENT}
      </p>

      <h2>4. Who processes your information</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Service</th>
            <th style={th}>What it does</th>
            <th style={th}>What we know</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>Vercel</td>
            <td style={td}>Hosts the website and the connection agents use. Everything you and your agents send us passes through it.</td>
            <td style={td}>Our functions run in Washington, D.C. Request logs are kept briefly; we have not confirmed the period.</td>
          </tr>
          <tr>
            <td style={td}>Neon</td>
            <td style={td}>Our database. It holds the stored information in section 1.</td>
            <td style={td}>AWS us-east-1 (United States). Our recovery window is 6 hours.</td>
          </tr>
          <tr>
            <td style={td}>WorkOS</td>
            <td style={td}>Signs you in. It holds your email and sign-in details.</td>
            <td style={td}>We have not confirmed where it processes data.</td>
          </tr>
          <tr>
            <td style={td}>Anthropic (the Claude AI service)</td>
            <td style={td}>Drafts a rule from your feedback, compares a new rule with your existing ones, and helps compare a task with your rules.</td>
            <td style={td}>See the paragraph below.</td>
          </tr>
        </tbody>
      </table>
      <p>We have not confirmed written data-processing terms with each provider.</p>
      <p>
        <strong>What goes to Anthropic, exactly.</strong> (a) <em>Rule draft</em>, after a thumbs-down: the reasons you chose, your note if you wrote one, the task summary, the
        task&apos;s kind, and the wording of up to ten of your approved rules in that kind. (b) <em>Overlap check</em>, when a proposed rule may overlap one of yours: the wording
        and the &quot;when it applies&quot; line of both rules, not redacted. (c) <em>Scoring</em>: the task summary and the rule wording after we replace names, emails, phone
        numbers, addresses and birth dates with placeholders. That replacement is best-effort and can miss a name. We do not send your saved details to Anthropic directly,
        but the text we send can repeat what you or an agent wrote. Anthropic&apos;s statements about retention and training come from its public pages and we have not verified them for our
        configuration. Our use of Anthropic is separate from any Claude account or agent you connect yourself.
      </p>

      <h2>5. Your AI agents</h2>
      <ul>
        <li>Review an agent&apos;s provider before you connect it. When you connect an agent, it can read the details and rules you allow and can tell us what it did.</li>
        <li>
          Changing or removing an agent on Your agents stops its future access through Rare Tomato immediately. It cannot recall what the agent already received. {AGENT_MEMORY_NOTE}{" "}
          Independent providers may keep copies in their own memory under their own terms.
        </li>
        <li>
          Rules are advice. An agent must ask for them and may ignore them, and we cannot see whether it followed one. Task records are the agent&apos;s own reports. {SCORE_ORIGIN}
        </li>
        <li>We remain responsible for our own processing of your information.</li>
      </ul>

      <h2>6. Your choices, your rights and how long we keep things</h2>
      <ul>
        <li>See, edit and delete any detail, rule or task record. Deleting removes it from our database straight away.</li>
        <li>Download everything we hold about you as one file, on Settings and data.</li>
        <li>See which agent asked for which kinds of information and when, on Settings and data.</li>
        <li>Delete your account and everything in it, on Settings and data.</li>
        <li>Change what each agent can read, or remove it, on Your agents.</li>
        <li>You can also email support@raretomato.ai, including if information about you was added by someone else and you have no account.</li>
      </ul>
      <p>
        Depending on where you live, you may have rights to access, correct, delete or get a copy of your information. We will respond within the time the law requires. You may
        also contact your local data protection authority.
      </p>
      <p>
        <strong>What deleting your account removes at once:</strong> everything we hold about you in our database (details, task records, feedback, rules and drafts, the check
        results, the activity record and your agent connections), and we ask our sign-in provider to remove your sign-in record. <strong>What can remain:</strong> a one-way
        scrambled form of your sign-in identifier (so an old sign-in cannot quietly re-create the account); our database provider&apos;s 6-hour recovery window; short-lived host
        logs; and whatever an agent or Anthropic has kept. We keep your information until you delete it.
      </p>

      <h2>7. Where it is processed, and why</h2>
      <p>{RUNS_IN_US} We have not confirmed transfer arrangements with each provider.</p>
      <p>
        We process information to provide the service you ask for, to keep it secure and, for optional health details you choose to add, because you chose to add them. You can
        withdraw that by deleting them or by emailing us.
      </p>

      <h2>8. Household members and children</h2>
      <p>
        Accounts are for adults only. Children cannot create accounts or connect agents. If you add information about a household member, use first names or nicknames and only
        what is needed. Do not add full birth dates (a birth year is fine), government IDs or clinical documents. Only add a child&apos;s details with parental or guardian
        authority. To ask about information added about you, or about a child you have authority for, email support@raretomato.ai.
      </p>

      <h2>9. Cookies and browser storage</h2>
      <p>{COOKIES_PUBLIC}</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>What it does</th>
            <th style={th}>How long</th>
            <th style={th}>Needed?</th>
          </tr>
        </thead>
        <tbody>
          {COOKIE_ROWS.map((c) => (
            <tr key={c.name}>
              <td style={td}>{c.name}</td>
              <td style={td}>{c.what}</td>
              <td style={td}>{c.lasts}</td>
              <td style={td}>{c.needed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{COOKIES_WORKOS}</p>

      <h2>10. Changes and contact</h2>
      <p>
        We update this notice and its date when something changes. Material changes to the Terms need you to accept them again the next time you sign in. We do not send an email
        about changes yet.
      </p>
      <p>
        {OPERATOR_LINE} {CONTACT_LINE}
      </p>
      <p style={muted}>
        <Link href="/terms">Terms</Link>
      </p>
    </main>
  );
}
