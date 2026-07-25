/**
 * MicButton + useDictation, exercised together (the hook has no UI of its
 * own to assert against). Mocks the three browser primitives it touches —
 * getUserMedia, MediaRecorder, fetch — and never lets a real network call
 * happen.
 *
 * The load-bearing assertions:
 *  - every processing state is real text from lib/copy/dictation, not a
 *    hardcoded string re-typed in the test (imports the real module);
 *  - a denied permission never calls fetch (nothing was recorded, honestly);
 *  - an unsupported browser disables the button with the reason visible;
 *  - a failed upload says so, and never claims the recording was saved;
 *  - the microphone is released (every track stopped) once recording ends;
 *  - no session, no upload: when ensureDemoAccess() resolves false, the
 *    recording ends in the same honest failed copy and fetch is never
 *    called (the route 401s without a held session anyway).
 */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MicButton } from "../MicButton";
import {
  DICTATION_ERRORS,
  DICTATION_STATES,
  MIC_START_LABEL,
  MIC_STOP_LABEL,
} from "@/lib/copy/dictation";

// vi.mock factories are hoisted above every import in this file, including
// the static import below, so the mock function must come from
// vi.hoisted() (see components/data/__tests__/supabase-browser.test.ts).
const { ensureDemoAccess } = vi.hoisted(() => ({ ensureDemoAccess: vi.fn() }));
vi.mock("@/components/data/supabaseBrowser", () => ({ ensureDemoAccess }));

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

const SOURCE_RESPONSE = {
  mode: "fixtures",
  source: {
    id: "22222222-2222-4222-8222-222222222222",
    person_id: PERSON_ID,
    kind: "audio",
    title: "Dictation, 25 July 2026",
    storage_path: "audio/dictation-1.webm",
    transcript: "",
    transcript_confidence: 0,
    author_member_id: null,
    created_at: "2026-07-25T10:00:00.000Z",
  },
};

class MockTrack {
  stop = vi.fn();
}

class MockMediaStream {
  private tracks: MockTrack[];
  constructor(trackCount = 1) {
    this.tracks = Array.from({ length: trackCount }, () => new MockTrack());
  }
  getTracks() {
    return this.tracks;
  }
}

type DataAvailableHandler = ((event: { data: Blob }) => void) | null;
type StopHandler = (() => void) | null;

let recorderInstances: MockMediaRecorder[] = [];

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: "inactive" | "recording" = "inactive";
  ondataavailable: DataAvailableHandler = null;
  onstop: StopHandler = null;
  stream: MockMediaStream;

  constructor(stream: MockMediaStream) {
    this.stream = stream;
    recorderInstances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio-bytes"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

let getUserMedia: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

/**
 * getUserMedia is deliberately left pending until the test resolves it —
 * resolving it inside the same tick as the click races the "requesting"
 * state off the screen before an assertion can see it.
 */
function installSupportedBrowser() {
  let resolveStream: (stream: MockMediaStream) => void = () => {};
  getUserMedia = vi.fn(
    () =>
      new Promise<MockMediaStream>((resolve) => {
        resolveStream = resolve;
      }),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  return {
    grantMic: async () => {
      await act(async () => {
        resolveStream(new MockMediaStream());
      });
    },
  };
}

beforeEach(() => {
  recorderInstances = [];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // Default: a session is already held, so every existing test below still
  // reaches the network call unchanged.
  ensureDemoAccess.mockReset();
  ensureDemoAccess.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MicButton", () => {
  it("walks requesting -> recording -> uploading -> saved, posting a FormData with audio and person_id", async () => {
    const { grantMic } = installSupportedBrowser();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => SOURCE_RESPONSE,
    });

    render(<MicButton personId={PERSON_ID} />);

    fireEvent.click(screen.getByRole("button", { name: MIC_START_LABEL }));

    // The state copy appears both as visible text and in the persistent
    // live region, so query for all occurrences.
    expect(screen.getAllByText(DICTATION_STATES.requesting).length).toBeGreaterThan(0);

    await grantMic();

    await waitFor(() => {
      expect(screen.getAllByText(DICTATION_STATES.recording).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: MIC_STOP_LABEL }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/voice/upload");
    const body: FormData = init.body;
    expect(body.get("audio")).toBeInstanceOf(Blob);
    expect(body.get("person_id")).toBe(PERSON_ID);

    await waitFor(() => {
      expect(screen.getByText(SOURCE_RESPONSE.source.title)).toBeInTheDocument();
    });
    expect(screen.getByText(DICTATION_STATES.saved)).toBeInTheDocument();

    // Mic released: every track on the captured stream was stopped once
    // recording ended.
    const recorder = recorderInstances[0];
    expect(recorder).toBeDefined();
    for (const track of recorder.stream.getTracks()) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
  });

  it("threads an explicit mode onto the upload URL as ?mode=<mode>", async () => {
    const { grantMic } = installSupportedBrowser();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => SOURCE_RESPONSE,
    });

    render(<MicButton personId={PERSON_ID} mode="live" />);

    fireEvent.click(screen.getByRole("button", { name: MIC_START_LABEL }));
    await grantMic();

    await waitFor(() => {
      expect(screen.getAllByText(DICTATION_STATES.recording).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: MIC_STOP_LABEL }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/voice/upload?mode=live");
  });

  it("releases the microphone when unmounted mid-recording, so the browser indicator never stays lit", async () => {
    const { grantMic } = installSupportedBrowser();

    const { unmount } = render(<MicButton personId={PERSON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: MIC_START_LABEL }));
    await grantMic();

    await waitFor(() => {
      expect(screen.getAllByText(DICTATION_STATES.recording).length).toBeGreaterThan(0);
    });

    const recorder = recorderInstances[0];
    expect(recorder).toBeDefined();

    // Tear the component down while still recording. The cleanup effect must
    // stop every track (mic indicator is track-gated) — dropping this in the
    // hook would leave the mic hot after the UI is gone.
    unmount();

    for (const track of recorder.stream.getTracks()) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
    // Nothing was recorded to completion, so no upload was attempted.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the denied copy and never calls fetch when permission is refused", async () => {
    getUserMedia = vi.fn(async () => {
      const error = new Error("denied");
      error.name = "NotAllowedError";
      throw error;
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);

    render(<MicButton personId={PERSON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: MIC_START_LABEL }));

    expect((await screen.findAllByText(DICTATION_ERRORS.denied)).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables the button with the reason visible when the browser cannot record audio", () => {
    vi.stubGlobal("navigator", {});

    render(<MicButton personId={PERSON_ID} />);

    const button = screen.getByRole("button", { name: MIC_START_LABEL });
    expect(button).toBeDisabled();
    expect(screen.getByText(DICTATION_ERRORS.unsupported)).toBeInTheDocument();
  });

  it("shows the failed copy, and never the saved copy, when the upload responds with a server error", async () => {
    const { grantMic } = installSupportedBrowser();
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "storage unavailable" }),
    });

    render(<MicButton personId={PERSON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: MIC_START_LABEL }));

    await grantMic();

    await waitFor(() => {
      expect(screen.getAllByText(DICTATION_STATES.recording).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: MIC_STOP_LABEL }));

    expect((await screen.findAllByText(DICTATION_ERRORS.failed)).length).toBeGreaterThan(0);
    expect(screen.queryByText(DICTATION_STATES.saved)).not.toBeInTheDocument();
  });

  it("shows the failed copy and never calls fetch when no session can be established", async () => {
    ensureDemoAccess.mockResolvedValue(false);
    const { grantMic } = installSupportedBrowser();

    render(<MicButton personId={PERSON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: MIC_START_LABEL }));

    await grantMic();

    await waitFor(() => {
      expect(screen.getAllByText(DICTATION_STATES.recording).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: MIC_STOP_LABEL }));

    expect((await screen.findAllByText(DICTATION_ERRORS.failed)).length).toBeGreaterThan(0);
    expect(screen.queryByText(DICTATION_STATES.saved)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("announces every state through one persistent live region and politely restores focus", async () => {
    const { grantMic } = installSupportedBrowser();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => SOURCE_RESPONSE,
    });

    render(<MicButton personId={PERSON_ID} />);

    // Exactly one live region, present from the first render and stable
    // across every state — freshly mounted aria-live nodes are not reliably
    // announced, so the same node must persist with its text swapped.
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: MIC_START_LABEL }));
    expect(screen.getByRole("status")).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent(DICTATION_STATES.requesting);

    await grantMic();

    await waitFor(() => {
      expect(liveRegion).toHaveTextContent(DICTATION_STATES.recording);
    });
    // Entering `requesting` disabled the button and dropped focus to body;
    // once recording is interactive again, focus is restored to the button.
    expect(screen.getByRole("button", { name: MIC_STOP_LABEL })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: MIC_STOP_LABEL }));

    await waitFor(() => {
      expect(liveRegion).toHaveTextContent(SOURCE_RESPONSE.source.title);
    });
    expect(screen.getByRole("status")).toBe(liveRegion);
    expect(screen.getByRole("button", { name: MIC_START_LABEL })).toHaveFocus();
  });

  it("never steals focus from a field the user moved to during the upload", async () => {
    const { grantMic } = installSupportedBrowser();
    let resolveUpload: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
          resolveUpload = resolve;
        }),
    );

    render(
      <div>
        <MicButton personId={PERSON_ID} />
        <input aria-label="Elsewhere" />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: MIC_START_LABEL }));
    await grantMic();
    await waitFor(() => {
      expect(screen.getAllByText(DICTATION_STATES.recording).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: MIC_STOP_LABEL }));

    // The hook awaits ensureDemoAccess() before fetch, so the request
    // itself starts a tick later than the click — wait for it to actually
    // be in flight (and resolveUpload captured) before moving focus.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // While the upload is in flight, the user focuses another field.
    const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" });
    act(() => {
      elsewhere.focus();
    });

    await act(async () => {
      resolveUpload({ ok: true, json: async () => SOURCE_RESPONSE });
    });

    await waitFor(() => {
      expect(screen.getAllByText(SOURCE_RESPONSE.source.title).length).toBeGreaterThan(0);
    });
    // Focus stays where the user put it — restoration only happens when
    // focus had fallen to body.
    expect(elsewhere).toHaveFocus();
  });
});
