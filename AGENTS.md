# Email Reader — project agent addendum

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
- Official name: `Email Reader` (manifest display name); primary
  invocation name: `email reader`; the old phrase `mail reader` was
  tested live 2026-11-12 and does NOT resolve (Amazon allows only
  one guaranteed invocation name; user accepted — teach only
  "ask email reader to ..."; a second alias skill was considered and
  declined as unnecessary)
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
        More -> Skills & Games -> Your Skills -> Dev tab -> Email Reader
        -> ENABLE TO USE (same Amazon account as developer)
      - Local debug via `ask run` does NOT route traffic; fell back to
        ngrok HTTPS tunnel (Phase 6 Lambda is the permanent home later)
      - Local HTTP bridge: `local-server.js` on 127.0.0.1:8443 wraps
        the ASK handler (GET /health, POST invoke); logs intent name
        and response speech
      - ngrok free plan allows one endpoint; opencode's
        `ngrok-tunnel.service` must stay stopped while the alexa
        tunnel runs — it auto-started at boot on the 2026-11-11
        reboot and STOLE the pinned hostname, so it is now stopped
        AND disabled (re-enable with `systemctl --user enable
        ngrok-tunnel.service` only when the alexa tunnel is off);
        alexa tunnel config lives at
        `~/.config/ngrok/alexa-mail-reader.yml` (mode 600, home dir —
        NOT /tmp, which is wiped on reboot; format: `version: "2"`,
        top-level `authtoken`, tunnel key `hostname:` — ngrok
        3.39.7 rejects `version: "3"`/`domain:` for this setup);
        authtoken ROTATED 2026-11-12 via dashboard roll + one-time
        local paste form (port 18765) — the earlier chat-leaked value
        is dead; both config files (alexa + opencode) updated, tunnel
        verified live on the new token, form and all its files removed
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
- [x] Phase 4 — reading mail (accepted 2026-11-12: every command
      verified live — list, summaries, chunked body with continue,
      jump to message N, next/previous, repeat, count, search by
      sender (confirmed live 2026-11-12), exit/quit, help, stop,
      reply/compose flow entry points, cross-session resume greeting;
      a 19-utterance simulator battery cross-checked against server
      logs — simulator one-shot mode is stricter than live Alexa+ for
      launch/read-it/stop phrasings, so the live log is the source
      of truth)
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
      - Business-email HTML extraction hardened (2026-11-12, user
        report: SoFi/Home Depot read as raw markup): entity decoding
        now covers numeric (decimal/hex) and named entities with
        unknown ones dropped, zero-width/format chars stripped,
        HTML comments (incl. Outlook conditional blocks) removed
        before and after decode, entity-encoded markup re-stripped
        in a 3-pass loop, and a broken plain-text part (CSS or
        escaped tags) falls back to the HTML part
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
      - 77 tests green (handler + gmail + text + speech + store)
      - Remaining Phase 4 loose end CLOSED 2026-11-12: alias phrase
        "mail reader" fails live (simulator resolved it, real Alexa+
        did not); primary "email reader" is the only phrase to teach
- [x] Phase 5 — reply and compose with confirmation (accepted
      2026-11-13: reply dictation + read-back + discard passed live;
      compose + phonetic address fix + real send to self passed live)
      - `gmail.sendMessage` POSTs base64url raw MIME (To/Subject/
        In-Reply-To/References with header newlines folded, optional
        threadId); same 4s timeout + one retry as all Gmail calls
      - Reply: builds a threaded draft from the open message (sender
        address parsed from the From header, Re: subject, Message-ID
        and threadId from the full fetch), then a
        `Dialog.ElicitSlot` on AddBodyIntent captures ONE bare
        dictated utterance (no "add" prefix needed right after
        "reply")
      - Compose: dialog now elicits recipient → subject (spells the
        address back letter by letter first; "say skip" leaves it
        blank) → then the same dictation elicitation
      - Read-back gate per plan 8.4/8.5: "To Maya at gmail dot com"
        (or the spelled address for compose) + subject + "You said:
        ..." + "Send it?" — "send it"/"yes" sends ("Sent to ..."),
        "no" discards ("Reply discarded."), "add ..." appends;
        8,000-char body cap, read-back clipped at 700 chars
      - Drafts live only in session attributes — never persisted to
        the position store (plan: losing an unsent draft on timeout
        is acceptable until Phase 7)
      - 102 tests green (Phase 5 set of 89 + phonetic fixes + contacts
        lookup: people API client/matching + compose/search
        resolution)
      - Phonetic address fixes ported from VoiceGmail
        `ContactMatcher.kt` (2026-11-13, user report: dcon2000 heard
        as decon2000): `src/fixes.js` applies the curated dcon-family
        rules, NATO-letter mapping and verbal punctuation ("at"/"dot")
        to the compose recipient only — generic letter-sound swaps
        were contact-match variants there and are deliberately NOT
        applied blind; the letter-by-letter read-back stays the
        safety net
      - Model push verified live: dialog intents ComposeIntent +
        AddBodyIntent, subject and dictation elicitation prompts
      - KNOWN PLATFORM QUIRK (2026-11-13): Alexa+ intermittently
        hijacks one-shot starts — even correct "ask email reader to
        ..." phrasings get answered by Alexa+ natively with ZERO
        requests reaching the skill (log-proven); replies also arrive
        as Fallback or die on the ~8s answer window. Reliable
        pattern: any skill command as door-opener, then all
        commands in-session; in-session dispatch is stable. No
        skill-side fix exists — Amazon routing only
      - Contacts lookup pulled forward from Phase 7 (2026-11-13,
        user request): `src/people.js` searches Google otherContacts
        (the Gmail autocomplete pool, scope
        `contacts.other.readonly`) — compose accepts a NAME (best
        match resolved before the letter-by-letter read-back; no
        match re-elicits the recipient) and search-by-sender maps a
        name to `from:<address>`; `account-linking.json` in the repo
        is the source of truth for the linking config — the ask-cli
        `update-account-linking-info` gives a bare 400, use a direct
        PUT to `.../stages/development/accountLinkingClient` with the
        CLI access token from `~/.ask/cli_config` and the Google
        client secret from the local secret file (body nested under
        `accountLinkingRequest`, clientSecret required) — NEW SCOPE
        REQUIRES THE USER TO RE-LINK GOOGLE before contacts resolve
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
