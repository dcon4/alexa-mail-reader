# Mail Reader — Alexa Gmail Skill

An Alexa skill that reads Gmail by voice and sends replies, built for
a blind end user. Companion to the VoiceGmail Android app
(`dcon4/Voice-Only-Email`), which shares the same Google Cloud project.

Plan: see the "Alexa Gmail Skill Plan" report in
`/mnt/ls-share/opencode/reports/`.

## Status

Phase 0 is in progress: repository and CI are green, the skill exists
on Amazon's side (skill ID `amzn1.ask.skill.9c554724-207c-464e-a0e2-ae3158077bf5`),
and the Google Web credential is pending. Phases follow the plan
report: accounts, Gmail proof, skill skeleton, account linking on a
real Echo, reading mail, reply/compose, hardening. See `AGENTS.md`
for the live phase checklist.

## Layout

- `skill-package/skill.json` — skill manifest (name: Mail Reader)
- `skill-package/interactionModels/custom/en-US.json` — voice model,
  invocation name `mail reader`
- `src/index.js` — Lambda handler (stub until Phase 2)
- `test/` — unit tests run by CI
- `.github/workflows/ci.yml` — tests plus deploy-bundle artifact on
  every push and pull request

## Commands

```bash
npm ci
npm test
```

## Deployment

CI uploads a `mail-reader-bundle` artifact (skill package plus
Lambda source) on every green run. Deploying that bundle to AWS
Lambda lands in Phase 6 of the plan.
