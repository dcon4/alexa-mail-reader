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
- [ ] Phase 0 cont. — Amazon developer sign-in, skill created, Google
      Web credential with Amazon redirect URIs
- [ ] Phase 1 — Gmail API proof of life
- [ ] Phase 2 — skill skeleton in the Alexa simulator (ASK SDK)
- [ ] Phase 3 — account linking on a real Echo (pivotal; decides
      7.1 vs 7.2)
- [ ] Phase 4 — reading mail
- [ ] Phase 5 — reply and compose with confirmation
- [ ] Phase 6 — hardening, log share endpoint, verbose toggle,
      deploy workflow
- [ ] Phase 7 — optional extras (mark as read, contacts by name,
      cross-session drafts, APL)

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
