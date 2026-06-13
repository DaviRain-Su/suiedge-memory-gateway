# Demo video storyboard (5 minutes)

Target length: **5:00**. Audience: Sui Overflow hackathon judge.
Goal: show that the gateway actually moves bytes through Walrus and Sui
testnet, not just a screenshot of a green test suite.

| t       | shot                                          | voice-over                                                                                                  |
| ------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 0:00    | Black, then title card: "SuiEdge Memory Gateway" | "Five minutes. Real Sui. Real Walrus. Real agent memory on-chain."                                     |
| 0:10    | Terminal, `git log --oneline \| head -7`      | "Six days, seven commits. Move package, Next.js gateway, REST + MCP, dashboard, e2e."                         |
| 0:30    | Browser: dashboard, no wallet connected       | "This is the gateway at <railway-url>. It serves a REST API, an MCP server, and a React dashboard."         |
| 0:50    | Browser: click 'Connect Wallet' → Sui wallet pops | "We connect a Sui wallet. The gateway will sign every PTB through it."                                     |
| 1:10    | Browser: create new space, name "Hackathon demo" | "Create an AgentSpace. The owner is the connected wallet, the active version is 0."                          |
| 1:30    | Browser: write first memory                    | "Write a memory. The gateway PUTs the body to Walrus, then anchors a MemoryPointer on Sui via a PTB."         |
| 1:50    | Terminal: `curl /api/v1/spaces/:id/context`    | "Restore context. The gateway loads the latest pointer, fetches the blob, returns the payload."             |
| 2:10    | Browser: switch to second agent address        | "Now a second agent. It has a different wallet. We share access via an AccessPolicy object."                |
| 2:30    | Browser: write from second agent               | "The second agent can write a memory to the same space. Walrus blob, Sui pointer — two writers, one source of truth." |
| 2:50    | Browser: save an artifact (a markdown plan)   | "Save an artifact. Same pattern: Walrus body, ArtifactPointer on Sui."                                       |
| 3:10    | Browser: write a proof log                     | "A proof log. Execution trace hash + blob pointer. Audit trail for a multi-step agent run."                  |
| 3:30    | Terminal: `sui client object <space-id>`        | "What does Sui actually see? Let me show you. The AgentSpace is a real object with active_memory_root bumped, version 2, three pointers attached." |
| 3:55    | Terminal: `sui client object <policy-id>`      | "The AccessPolicy. can_read=true, can_write=true, can_share=false. Owned by the space, not the wallet."      |
| 4:15    | Browser: revoke from owner wallet              | "Now revoke. The policy object is consumed. From now on, the second agent cannot read or write."             |
| 4:35    | Terminal: `curl` from second agent's signer    | "Watch the 403. The gateway refuses before even calling Sui, because the cache says the policy was revoked." |
| 4:55    | Browser: dashboard panels, 4 of them            | "The dashboard reflects all of this live. Memory timeline, artifacts, proof logs, access policy."            |
| 5:00    | End card: github.com/DaviRain-Su/suiedge-memory-gateway | "Code, design, deployment instructions in the repo. Thanks for watching."                          |

## Filming pre-flight

- Use 1920×1080, 30fps, mono audio.
- Browser: Chrome, clear cache, disable extensions other than the Sui
  wallet. Sign in to a testnet-only wallet.
- Terminal: 16pt Menlo or JetBrains Mono on a black background, prompt
  trimmed (`export PS1='$ '`), `set -a; . .env.testnet; set +a` first
  thing so env is visible.
- Rehearse once end-to-end to a wall clock before recording.

## Script files

- `docs/RECORDING.md` — the exact commands to run, with timing windows.
- `scripts/demo.sh` — automated 7-step REST demo used in the recording.
- `docs/screenshots/02-space-detail.png` — backup slide if a live step
  fails on camera.

## Captions

Generate a `.srt` from the voice-over column above. Each row's start time
matches the `t` value; durations default to 5s.
