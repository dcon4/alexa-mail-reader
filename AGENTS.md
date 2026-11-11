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
      Client Secret stays in the user's browser, never in chat or repo
- [x] Phase 2 — full interaction model + ASK SDK handler skeleton
      (model uploaded to SMAPI; 24 tests green)
- [ ] Phase 3 — Gmail proof folded in per plan section 14 (Phase 1
      collapsed): Google consent + skill account linking on a real
      Echo (pivotal; decides plan 7.1 vs 7.2)
      - Account linking client set on development stage (AUTH_CODE → Google)
      - Skill enabled for development (enablement PUT 204)
      - Unlinked responses return LinkAccount card + plan wording
      - Linked detection uses `context.System.user.accessToken`
      - Local debug session via `ask run` (1 hour TTL) for device routing
      - Dev skills do NOT appear in Alexa app search; path is
        More -> Skills & Games -> Your Skills -> Dev tab -> Mail Reader
        -> ENABLE TO USE (same Amazon account as developer)
      - Console Test page: user confirmed "Skill testing is enabled in
        Development"
      - Echo must be registered to the developer Amazon account;
        locale en-US
      - Echo invoke failed: "I am unable to reach the requested skill"
        (Alexa hit example.com/alexa, not local debug WS; zero
        "Skill request" lines in ask-run.log despite WS ESTAB)
      - Local debug does not route device traffic; fell back to ngrok
        HTTPS tunnel (Phase 6 Lambda is the permanent home later)
      - Local HTTP bridge: `local-server.js` on 127.0.0.1:8443 wraps
        the ASK handler (GET /health, POST invoke)
      - ngrok free plan allows one endpoint; systemd
        `ngrok-tunnel.service` (opencode) was stopped for Phase 3;
        alexa tunnel config at `/tmp/opencode/ngrok-alexa-only.yml`
      - Public URL `https://detail-online-exemplary.ngrok-free.dev`
        verified end-to-end (health ok, Launch returns LinkAccount)
      - SMAPI development manifest endpoint updated to that URL with
        `sslCertificateType: Wildcard`; local skill.json synced
      - Pending: Echo invoke "Alexa, open mail reader" → unlinked
        reply + LinkAccount card; then Google link; then linked reply
- [ ] Phase 4 — reading mail
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
