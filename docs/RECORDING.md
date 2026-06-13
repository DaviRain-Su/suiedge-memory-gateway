# Recording runbook

Use this as the script while filming `docs/STORYBOARD.md`. Every command
here is exactly what should appear on screen. Run them in order; the
storyboard columns map to these steps.

## Pre-recording

```bash
# 1. From the repo root
set -a; . ./.env.testnet; set +a
# Verify: echo $SUI_PACKAGE_ID
# Verify: sui client active-address  (should be 0xb908...ec41)
# Verify: sui balance               (should be > 0.5 SUI)

# 2. Open two terminals side by side
#    Left  =  shell with the curl commands
#    Right =  browser on the dashboard

# 3. Start the dev server
pnpm dev:live

# 4. Get the dashboard URL
echo "https://localhost:3000/?owner=$SUI_OWNER_ADDRESS"
```

## Scene 1 (0:00-0:10) — title card

No command. Cut to black with text overlay. (Optional ffmpeg one-liner:
`ffmpeg -f lavfi -i color=c=black:s=1920x1080:d=5 -vf "drawtext=text='SuiEdge Memory Gateway':fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 out.mp4`.)

## Scene 2 (0:10-0:30) — git log

```bash
git log --oneline | head -7
```

Expected output:

```
5bb6153 feat(phase3): live dashboard demo, e2e test, deploy artifacts, bilingual docs
2ffd3ee fix(live): make the testnet wiring actually work end-to-end
867d779 feat(live): real testnet wiring
e8b19d4 feat(day6): MCP server with 9 tools, e2e MVP test, demo script, README
45db70e feat(day5): real artifacts/proof-logs routes + 4 dashboard panels
e426778 feat(day4): access policy + share/revoke + multi-agent demo
0e9593b feat(day3): memory timeline + active context restore + version pointers
```

## Scene 3 (0:30-0:50) — dashboard load

Browser: visit `https://localhost:3000/`. Scroll slowly through the home
page. No clicks. The "Connect a Sui wallet" button should be visible.

## Scene 4 (0:50-1:10) — connect wallet

Browser: click "Connect a Sui wallet". Sui wallet pops. Select the
testnet address `0xb908f724ae9fd9f3859df7b42d1192649217bc4a677c99b58ec838db2ff6ec41`.
Approve.

## Scene 5 (1:10-1:30) — create space

Browser: click "New Space". Enter name "Hackathon demo". Submit.

Terminal (cut to for 1 second while waiting for tx to land):

```bash
sui client tx <digest-from-screen>  # optional, shows on-chain effects
```

## Scene 6 (1:30-1:50) — write memory

Browser: open the new space. Click "Write Memory". Enter:

```text
First SuiEdge memory. The gateway PUT 0.2KB to Walrus testnet,
then anchored version 1 on Sui testnet.
```

Submit. Wait for "Memory v1 written".

## Scene 7 (1:50-2:10) — restore context

Terminal:

```bash
SPACE_ID=<the new space id from the browser>
curl -s https://localhost:3000/api/v1/spaces/$SPACE_ID/context | jq .
```

Show the returned `memories` array. Point out the `payload` field — it's
the body you just wrote, fetched from Walrus.

## Scene 8 (2:10-2:30) — second agent

Browser: open a second Sui wallet tab (or use the same wallet to switch
accounts). Set the active address to a *different* testnet address
(suggestion: `0xREVIEWER…` placeholder; record a "this is a different
identity" voice-over even if it's the same keystore).

Click "Share". Pick the second address. can_read=true, can_write=true,
can_share=false. Submit.

## Scene 9 (2:30-2:50) — second agent writes

Browser (as second agent): open the same space, click "Write Memory",
enter "Reply from second agent: confirmed the testnet round-trip.".
Submit. Wait for "Memory v2 written".

## Scene 10 (2:50-3:10) — artifact

Browser: click "Save Artifact". Filename "hackathon-plan.md". Body:

```text
# Hackathon plan
1. Submit to Walrus track
2. Open-source under MIT
3. Live testnet demo
```

Submit.

## Scene 11 (3:10-3:30) — proof log

Browser: click "Add Proof Log". Body:

```text
step=write_memory, ok=true, gas=0.002, ts=...
```

Submit.

## Scene 12 (3:30-3:55) — sui client object

Terminal:

```bash
sui client object $SPACE_ID --json | jq '.content'
```

Show the on-chain `AgentSpace`: `active_memory_root` is a 32-byte hex,
`version` is 2, three pointers attached. This is the proof the data is
real Sui.

## Scene 13 (3:55-4:15) — sui client object (policy)

Terminal:

```bash
sui client object $POLICY_ID --json | jq '.content'
```

Show the `AccessPolicy` fields.

## Scene 14 (4:15-4:35) — revoke

Browser: switch back to the owner address. Open the policy row in the
"Access Policies" panel. Click "Revoke". Confirm.

## Scene 15 (4:35-4:55) — second agent blocked

Browser (as second agent): click "Write Memory". The UI should show a
"policy revoked" error. Switch to terminal:

```bash
curl -i -X POST https://localhost:3000/api/v1/spaces/$SPACE_ID/memories \
  -H 'X-Sui-Address: 0xREVIEWER...' \
  -H 'X-Sui-Signature: stub' \
  -H 'Content-Type: application/json' \
  -d '{"body":"should fail","contentType":"text/plain"}'
```

Show the 403 response.

## Scene 16 (4:55-5:00) — end card

Browser: scroll the dashboard one more time. Show all four panels with
the data filled in. Cut to end card with the repo URL.

## Post-recording

```bash
# Trim if needed
ffmpeg -i raw.mp4 -ss 0 -to 300 -c copy out.mp4

# Add captions (auto-generate, then edit)
whisper out.mp4 --output_format srt --output captions.srt
```

Upload to YouTube (unlisted is fine for the hackathon). Embed in
`docs/SUBMISSION.md` and the GitHub repo's README.
