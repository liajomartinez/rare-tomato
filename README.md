# Rare Tomato

**Correct an agent once, approve the rule, and every agent you use can get it from one place.**

Rare Tomato is a small web app for people who use AI agents (Claude, ChatGPT, Grok Bot, Muse and others). You keep a short list of your preferences and rules. Your agents can read them. When an agent does something you do not like, you give it a thumbs down with a reason, the app drafts a rule, and you approve it. Approved rules are offered to every agent you have connected. You also see what your agents *say* they did.

> **Rare Tomato is a personal project, open source and provided as is.** It is for adults who are 18 or older, anywhere in the world. Questions and requests: support@raretomato.ai.

## Is this for you?
**Honestly, maybe not.** If you use only Claude and your needs are simple, **Claude's own memory may already be enough.** Rare Tomato earns its place if you run **more than one agent**, or you want a **record of what your agents did against your rules**. It does not run tasks for you, and it never blocks, changes or reverses anything an agent does.

## How it works
1. **Connect an agent.** You give it one address and it signs in itself; there is no secret to copy. You confirm it on *Your agents*. Until you do, it can only say hello. ([Guides for each agent](docs/guides/README.md).)
   **Then one more step, which matters:** paste the *starter line* (shown on Your agents) into the agent's own instructions. Without it, Claude and ChatGPT did not call Rare Tomato at all in our tests; with it they did on every task in a small test. Your agents shows *Set up: not finished* until we see the agent ask for your rules or details, then *Working* with the date.
2. **Add your details** (preferences, contacts, family details). Only the agents you confirm, and only the kinds of detail you allow, can read them.
3. **See what your agents did.** Agents tell the app what they did (a *task record*). You rate it with a thumbs up or down.
4. **Fix it in about four taps.** Thumbs down, pick a reason, Send (a note is optional), then Save as a rule on the drafted rule. Nothing becomes a rule, and no agent can see it, until you save it; Not now deletes the draft.
5. **See how they are doing.** The Home screen shows an *Adherence score* (with a tomato that ripens as the score rises) for the last 14 days, always labeled **agent-reported** and always with a note on what it cannot see.
6. **Agents that cannot connect** get a copy-paste **care sheet**.
7. **Your data is yours.** Download everything, delete any single thing, or delete your account, on *Settings and data*. There is also a readable log of what your agents asked for.

## Honest limits (please read)
- **Rules are advice.** MCP, the way agents talk to Rare Tomato, is *pull*: an agent has to ask for your rules and can ignore them. Nothing here enforces a rule, and we cannot see whether an agent followed one.
- **Scores are agent-reported and never independently verified.** The score is computed over what an agent chose to log. It cannot see an action an agent never logged, or one logged wrongly. The scorer is a best-effort language model check and can be wrong. Until the golden sets are labeled and run, **no accuracy claim is made**.
- **The blocked-data check is best-effort, not a guarantee.** It turns away obvious ID, card, bank, password, insurance and medical-record numbers and test-result wording; it asks you to confirm health and money words, and labels health details *Sensitive*. It can miss things and can flag harmless text. It is not a guarantee that such information cannot be stored. Dietary needs and allergies are fine to add. These health allowances are provisional and may be narrowed before public launch.
- **Not end-to-end encrypted.** Details are encrypted at rest, but our servers can decrypt them to serve your agents.
- **Agents may keep what they read.** Deleting a detail here does not delete a copy an agent kept in its own memory.
- **Early providers.** Hosting (Vercel), database (Neon), sign-in (WorkOS) and the Claude API (Anthropic) are used on their standard plans. We have not confirmed every provider's retention or training terms in writing. Text you type in a feedback note, a rule or a task record can reach Anthropic when a rule is drafted or checked (see the Privacy Notice in the app).
- **Redaction before scoring is best-effort.** Names, emails, phone numbers, addresses and birth dates are replaced before text is checked, but it can miss a name.
- **Muse limit.** Muse works on a fresh connection, but in our tests it stopped working about an hour or two later; reconnect it (remove the connector in Muse, add it again, confirm it on Your agents). We do not know why. See [the Muse guide](docs/guides/muse.md).
- **Agents only use your rules if told to.** The starter line is advice to the agent, not enforcement, and an agent can skip it. *Working* on Your agents means a request reached our server; it does not mean the agent followed a rule. The evidence is small: six tasks each for Claude and ChatGPT counts only. We cannot see whether you pasted the line.
- **Jev (TypeSafe) scoring is off.** Scoring uses Claude Haiku. Jev is built but switched off until its provider answers questions about retention and training.
- **Agent connection outcomes (SPEC 13.4).** Claude: works (the must-pass gate). ChatGPT: works on a web Plus account. Grok Bot: works (added by asking it in chat). Muse: works with the limit above. Instinct: care sheet only, by design. In our measured tests only Grok Bot checked the rules on its own; Claude, ChatGPT and Muse did not until told to.

## Running it yourself
You need Node 24. Copy `.env.example` to `.env` and fill it in (never commit `.env`). Then:

```bash
npm install
npm test            # the whole suite, with an in-memory database; no secrets needed
npm run lint
npx tsc --noEmit
npm run build
npm run dev:test    # run the site against a test database
```

Production deploys go from a clean `git archive` export of a commit (so `.env`, `docs/` and `evals/` are never uploaded; see `.vercelignore`).

## What is in the repo
- `src/` the site, the MCP endpoint (`/mcp`) and the services.
- `docs/SPEC.md` the one spec. `docs/guides/` per-agent connection guides. `docs/decisions/` architecture decision records. `docs/privacy/` plain operating notes (incidents, requests).
- `evals/` the golden sets (inputs only; **the labels are the owner's**), the injection corpus, and saved results, failures included.
- `demo-agent/` a small reference agent for the before/after demo.

## Licence
Apache-2.0. See `LICENSE`.
