# Mail Reader — project agent addendum

Project-specific rules. The global rules live in
`~/.config/opencode/AGENTS.md`; read that first. Anything below only
adds to or overrides it.

## About this project

Alexa custom skill that reads and replies to Gmail by voice, for a
totally blind end user. Non-Android: the required debug-APK CI rules
from the global file do not apply; the analog is the
`mail-reader-bundle` artifact in `.github/workflows/ci.yml`, which
must stay green and must keep `if-no-files-found: error`.

## Plan and decisions (locked in 2026-11-09)

- Plan report:
  `/mnt/ls-share/opencode/reports/alexa-gmail-skill-plan-fleshed-out-2026-11-09.txt`
- Invocation name: `mail reader`
- Google Cloud project: reuse VoiceGmail's project `359413552450`
- Linking design: direct Google account linking (plan section 7.1);
  section 7.2 fallback only if Phase 3 fails
- Phase order: proof of linking (Phase 3) before any feature work

## Phase checklist

- [x] Phase 0 — repository, scaffold, green CI
- [x] Phase 0 cont. — Amazon developer sign-in (ASK CLI profile
      `default`), skill created via SMAPI
- [x] Phase 0 cont. — Google Web credential created (Client ID below);
      Client Secret stored locally at
      `~/.config/alexa-mail-reader/google-client-secret` (mode 600,
      never in chat or repo)
- [x] Phase 2 — full interaction model + ASK SDK handler skeleton
      (model uploaded to SMAPI; 24 tests green)
- [x] Phase 3 — account linking proof complete (2026-11-11), plan
      section 7.1 direct Google linking confirmed working; no Echo —
      tested entirely in the Alexa app on the developer account
      - Account linking client set on development stage (AUTH_CODE → Google)
      - Skill enabled for development (enablement PUT 204)
      - Unlinked responses return LinkAccount card + plan wording
      - Linked detection uses `context.System.user.accessToken`
      - Dev skills do NOT appear in Alexa app search; path is
        More -> Skills & Games -> Your Skills -> Dev tab -> Mail Reader
        -> ENABLE TO USE (same Amazon account as developer)
      - Local debug via `ask run` does NOT route traffic; fell back to
        ngrok HTTPS tunnel (Phase 6 Lambda is the permanent home later)
      - Local HTTP bridge: `local-server.js` on 127.0.0.1:8443 wraps
        the ASK handler (GET /health, POST invoke); logs intent name
        and response speech
      - ngrok free plan allows one endpoint; systemd
        `ngrok-tunnel.service` (opencode) must stay stopped while the
        alexa tunnel runs; config `/tmp/opencode/ngrok-alexa-only.yml`
      - Ad-hoc `node local-server` / `ngrok` processes die when agent
        tool sessions recycle (ngrok got a stop signal 2026-11-11
        17:03; the next three user asks all failed with Amazon's
        "There was a problem with the requested skill response" — zero
        requests reached the server). Both now run as systemd user
        units: `alexa-local-server.service` (logs append to
        `/tmp/opencode/local-server.log`) and `ngrok-alexa.service`,
        both with `Restart=always` and enabled at login — restart via
        `systemctl --user`, not bare `node`/`ngrok`
      - Public URL `https://detail-online-exemplary.ngrok-free.dev`
        in SMAPI manifest with `sslCertificateType: Wildcard`
      - Account-linking scopes must be full Google URIs
        (`https://www.googleapis.com/auth/gmail.readonly`,
        `.../gmail.send`), not bare `gmail.readonly` — bare form gave
        Google `invalid_scope`
      - Google client secret stored at
        `~/.config/alexa-mail-reader/google-client-secret` (mode 600,
        not in repo) — needed for the Phase 4 token exchange
      - Linking succeeded; linked "Read my email" speaks correct
        handler speech in the Alexa app (verified in server log:
        `intent=ReadUnreadIntent linked=true` + correct SSML)
- [ ] Phase 4 — reading mail (implementation done 2026-11-11,
      awaiting the scripted voice acceptance run)
      - `src/gmail.js` — list/get via Gmail REST, Bearer token from
        `context.System.user.accessToken`, 4s timeout, one retry on
        5xx/429/network, typed `GmailError` with status (0 = network)
      - `src/text.js` — plain-text preferred, HTML fallback strip,
        quote/signature removal, 2,500-char chunks at sentence
        boundaries, attachment names
      - `src/speech.js` — XML escape, clip, relative time ("2 hours
        ago"), sender name, count text
      - Launch / "read my email" speak unread count + up to 5
        summaries (from, subject, relative time); list capped at 25
      - "read it" / "continue" read body chunks with continue/end
        prompts; at the end of a message, "read it"/"continue"
        restarts it (no dead-end loop — user report 2026-11-11);
        "read message N" jumps and reads; next/previous speak
        summaries; count and search-by-sender are live
      - 401 → reconnect speech + LinkAccount card; other Gmail errors
        → "could not reach your mail" fail-soft; session attributes
        never persist the access token
      - Spoken text is sanitized: URLs become their bare domain
        (never paths or query strings), emoji are stripped — request
        from user 2026-11-11 after real-mail testing
      - Gmail link verified working live 2026-11-11 (launch speaks
        real unread list with relative times)
      - Skill ID checked on every request (`src/index.js` SKILL_ID)
      - Cross-session resume of reading position (2026-11-11): every
        response mirrors the position to
        `~/.config/alexa-mail-reader/positions.json` (mode 600, outside
        the repo; override with `POSITION_STORE_PATH`); a new session
        hydrates the saved list before dispatch; Launch speaks
        "Welcome back" with the saved message summary; the same
        greeting also fires on cold ask-entries (the launch-phrase
        block below makes ask the real entry point): cold "read it"
        says "Welcome back" then reads/continues the saved message,
        cold "how many unread" appends "You were last on: ... Say
        read it to continue"; "read my email" still refreshes from the
        top; "how many unread" never resets the place in the list
      - Launch phrases BLOCKED on this account (2026-11-11): "Alexa,
        open/launch/start mail reader" answers "Sorry, that is not
        supported on this device" — Alexa+ intercepts launch phrases
        for unpublished dev skills (known Amazon-side issue; verified
        our side healthy: SMAPI simulation invokes the skill fine,
        enablement/model/manifest intact, zero requests reach us during
        failures). Reliable entries are the ask forms: "Alexa, ask
        mail reader to read my email / read it / how many unread"
      - Progressive "Checking your mail" phrase deferred to Phase 6
      - 72 tests green (handler + gmail + text + speech + store)
      - Pending: scripted acceptance run — open, count, read message 1
        with a continue hop on the long HTML fixture, jump to message
        3, search from a sender, stop; every utterance first try
- [ ] Phase 5 — reply and compose with confirmation
- [ ] Phase 6 — hardening, log share endpoint, verbose toggle,
      deploy workflow
- [ ] Phase 7 — optional extras (mark as read, contacts by name,
      cross-session drafts, APL)

Note: plan Phase 1 (standalone Gmail proof script) is folded into
Phase 3 — it would need an extra OAuth credential and a secret handoff
for no validation that Phase 3 does not already provide.

## Account identifiers

- Vendor ID: `M3BE8RO26ZG468`
- Skill ID: `amzn1.ask.skill.9c554724-207c-464e-a0e2-ae3158077bf5`
- Google Cloud project (shared with VoiceGmail): `359413552450`
- Google Web OAuth Client ID (public):
  `359413552450-0v005jcolutf5ctj40mnik8so436qdl6.apps.googleusercontent.com`
- Amazon redirect URIs for the Google OAuth client:
  - `https://pitangui.amazon.com/api/skill/link/M3BE8RO26ZG468`
  - `https://layla.amazon.com/api/skill/link/M3BE8RO26ZG468`
  - `https://alexa.amazon.co.jp/api/skill/link/M3BE8RO26ZG468`

## Key files

| Path | Purpose |
|------|---------|
| `skill-package/skill.json` | manifest |
| `skill-package/interactionModels/custom/en-US.json` | intents, invocation name |
| `src/index.js` | Lambda handler (stub until Phase 2) |
| `.github/workflows/ci.yml` | tests + bundle artifact |

## Rules

- Author identity for AI-generated commits is `dcon4 <dcon4@gmail.com>`.
- Never print the Google client secret, AWS keys, LWA tokens, or the
  ASK CLI refresh token in chat, logs, or files the user reads. The
  user pastes secrets directly into console fields.
- Verbose logging toggle and a token-protected log-share endpoint are
  required in Phase 6 (plan section 10); treat them as non-negotiable
  like the VoiceGmail share button.
- After every push to `main`, poll the workflow run to green and
  report the artifact, per the global CI monitoring rule.
- One user-facing step at a time; the user is sighted but non-technical
  and drives everything by TTS.
