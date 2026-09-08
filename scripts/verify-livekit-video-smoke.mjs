// Explicit opt-in: creates/deletes only randomly named smoke rooms on the chosen
// host. Tokens stay in this process/browser memory and are never written to disk.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshHost = process.argv[process.argv.indexOf("--ssh") + 1];
if (!process.argv.includes("--ssh") || !/^[a-zA-Z0-9._-]+$/.test(sshHost ?? "")) {
  throw new Error("Explicit --ssh host is required");
}
const require = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { build } = require("esbuild");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const apiContainer = process.env.LIVEKIT_SMOKE_API_CONTAINER || "anotherme-prod-app-a-1";
if (!/^[a-zA-Z0-9._-]+$/.test(apiContainer)) throw new Error("Invalid container name");
const activeRooms = new Set();

function remoteSdk(script) {
  // stdin and stdout are pipes, not inherited: signing credentials and join
  // tokens must not appear in command lines, tool output, logs or artifacts.
  return JSON.parse(execFileSync("ssh", [
    sshHost,
    `docker exec -i -w /app/artifacts/api-server ${apiContainer} node --input-type=module`,
  ], {
    input: script,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }));
}

const sdkPreamble = `
  import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
  const url = process.env.LIVEKIT_URL;
  const serviceUrl = new URL(url);
  serviceUrl.protocol = serviceUrl.protocol === 'wss:' ? 'https:' : 'http:';
  const service = new RoomServiceClient(serviceUrl.toString(), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
`;

function createSmokeRoom() {
  const roomName = `codex-video-smoke-${randomUUID()}`;
  activeRooms.add(roomName);
  return remoteSdk(`${sdkPreamble}
    const roomName = ${JSON.stringify(roomName)};
    await service.createRoom({ name: roomName, maxParticipants: 2, emptyTimeout: 60, departureTimeout: 20 });
    const tokens = await Promise.all(['a', 'b'].map(async (role) => {
      const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity: roomName + '-' + role, ttl: 300 });
      token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA] });
      return token.toJwt();
    }));
    process.stdout.write(JSON.stringify({ roomName, url, tokens }));
  `);
}

function deleteSmokeRoom(roomName) {
  if (!activeRooms.has(roomName) || !/^codex-video-smoke-[0-9a-f-]{36}$/.test(roomName)) {
    throw new Error("Refusing to delete a non-owned room");
  }
  remoteSdk(`${sdkPreamble}
    try { await service.deleteRoom(${JSON.stringify(roomName)}); }
    catch (error) { if (error?.code !== 5 && error?.code !== 'not_found' && error?.status !== 404) throw error; }
    process.stdout.write(JSON.stringify({ deleted: true }));
  `);
  activeRooms.delete(roomName);
}

const bundle = await build({
  stdin: {
    resolveDir: path.join(root, "artifacts/mobile"),
    contents: `
      export * from './lib/voiceCall.web';
      export { attachCallVideoPlayback } from './lib/callVideoPlayback';
      export { RoomEvent, Track } from 'livekit-client';
    `,
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  globalName: "SmokeCall",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "silent",
});
const source = bundle.outputFiles[0].text;
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(source);
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<!doctype html><html><body><video id="remote" muted playsinline style="width:640px;height:360px"></video><video id="local" muted playsinline style="width:160px;height:90px"></video><script src="/bundle.js"></script></body></html>');
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let failed = false;

async function runScenario(name, delayCameraOnB = false) {
  const session = createSmokeRoom();
  const contexts = [];
  const startedAt = Date.now();
  let states = [];
  try {
    const pages = [];
    for (let i = 0; i < 2; i += 1) {
      const context = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1000, height: 800 } });
      contexts.push(context);
      if (i === 1 && delayCameraOnB) {
        await context.addInitScript(() => {
          const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = (constraints) => constraints?.video
            ? new Promise(() => {})
            : original(constraints);
        });
      }
      const page = await context.newPage();
      await page.goto(origin);
      pages.push(page);
    }

    await Promise.all(pages.map((page, i) => page.evaluate(async ({ url, token }) => {
      const { joinCall, prepareVideoCall, primeAudioPlayback, RoomEvent, Track, attachCallVideoPlayback } = window.SmokeCall;
      const events = [];
      const players = [];
      window.smoke = { events, players, videoBlocked: false };
      primeAudioPlayback();
      // Mirrors the fixed provider: camera permission preparation must not gate
      // room/microphone connectivity when the browser never settles the prompt.
      void prepareVideoCall();
      const joined = await joinCall(url, token, {
        media: "video",
        onDiagnostic: (phase, details) => events.push({ phase, details }),
      });
      const room = joined.room;
      window.smoke.room = room;
      window.smoke.joinReturned = true;
      const attached = new WeakSet();
      const attach = () => {
        for (const participant of room.remoteParticipants.values()) {
          const camera = participant.getTrackPublication(Track.Source.Camera)?.videoTrack;
          if (camera && !attached.has(camera)) {
            attached.add(camera);
            players.push(attachCallVideoPlayback(camera, document.getElementById("remote"), {
              muted: true,
              onBlocked: (blocked) => { window.smoke.videoBlocked = blocked; },
            }));
          }
        }
        const local = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (local && !attached.has(local)) {
          attached.add(local);
          players.push(attachCallVideoPlayback(local, document.getElementById("local"), { muted: true, onBlocked: () => {} }));
        }
      };
      room.on(RoomEvent.TrackSubscribed, attach);
      room.on(RoomEvent.LocalTrackPublished, attach);
      attach();
      window.smoke.snapshot = async () => {
        let inboundAudioBytes = 0;
        let inboundVideoBytes = 0;
        let inboundFramesDecoded = 0;
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            const stats = await publication.track?.getRTCStatsReport();
            stats?.forEach((stat) => {
              if (stat.type !== "inbound-rtp") return;
              if ((stat.kind || stat.mediaType) === "audio") inboundAudioBytes += stat.bytesReceived || 0;
              if ((stat.kind || stat.mediaType) === "video") {
                inboundVideoBytes += stat.bytesReceived || 0;
                inboundFramesDecoded += stat.framesDecoded || 0;
              }
            });
          }
        }
        const video = document.getElementById("remote");
        return {
          connectionState: room.state,
          participantCount: room.remoteParticipants.size,
          localMicrophone: !!room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track,
          localCamera: !!room.localParticipant.getTrackPublication(Track.Source.Camera)?.track,
          inboundAudioBytes, inboundVideoBytes, inboundFramesDecoded,
          renderedVideoFrames: video.getVideoPlaybackQuality?.().totalVideoFrames || 0,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          videoBlocked: window.smoke.videoBlocked,
          diagnosticPhases: events.map((event) => event.phase),
        };
      };
    }, { url: session.url, token: session.tokens[i] })));

    // Poll resolved snapshots in Node. A Promise-valued browser predicate can
    // be treated as truthy by a wait helper, producing a false-positive result.
    const deadline = Date.now() + 45_000;
    let ready = false;
    while (Date.now() < deadline) {
      states = await Promise.all(pages.map((page) => page.evaluate(() => window.smoke.snapshot())));
      ready = states.every((state, i) => {
        const expectVideo = !delayCameraOnB || i === 1;
        return state.connectionState === "connected" && state.participantCount === 1 && state.localMicrophone && state.inboundAudioBytes > 0 && (!expectVideo || (state.inboundFramesDecoded > 0 && state.renderedVideoFrames > 0 && state.videoWidth > 0));
      });
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw Object.assign(new Error("Media criteria were not met"), { name: "MediaTimeout" });
    if (delayCameraOnB && states[1].localCamera) throw new Error("Expected delayed camera to stay unpublished");
    process.stdout.write(JSON.stringify({ scenario: name, passed: true, elapsedMs: Date.now() - startedAt, peers: states }) + "\n");
    for (const page of pages) {
      await page.evaluate(async () => {
        for (const player of window.smoke.players) player.dispose();
        await window.SmokeCall.leaveCall();
      });
    }
  } catch (error) {
    failed = true;
    process.stdout.write(JSON.stringify({ scenario: name, passed: false, errorName: error?.name || "Error", elapsedMs: Date.now() - startedAt, peers: states }) + "\n");
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    deleteSmokeRoom(session.roomName);
  }
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  await runScenario("two-way-video-and-audio");
  await runScenario("unresolved-camera-permission-keeps-audio-and-received-video", true);
} catch (error) {
  failed = true;
  process.stdout.write(JSON.stringify({ harnessFailure: true, errorName: error?.name || "Error" }) + "\n");
} finally {
  await browser?.close().catch(() => {});
  for (const roomName of [...activeRooms]) {
    try { deleteSmokeRoom(roomName); }
    catch { failed = true; process.stdout.write(JSON.stringify({ cleanupFailed: true, roomName }) + "\n"); }
  }
  await new Promise((resolve) => server.close(resolve));
}
process.exitCode = failed ? 1 : 0;
