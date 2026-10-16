import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { frameCanvas } from "../lib/photo";
import { findBarcode, readSearches, textReaderLoaded } from "../lib/photoReader";
import { CloseIcon } from "./icons";

// The camera, inside the app (2026-10-16). It first opened the phone's own
// camera app, but Android may close Chrome's page while that app is open,
// and the photo was lost ("Unable to complete previous operation due to low
// memory"). Here the page never leaves the screen. It looks for a barcode
// while you point, and reads the words when you tap. Nothing is recorded,
// and the camera is off once this closes.

// How often a frame is checked for a barcode, and how big it's checked at.
const SCAN_EVERY_MS = 400;
const SCAN_SIDE = 1280;

type State = "starting" | "live" | "blocked";

// Missing on old browsers and on pages not served over HTTPS.
const cameraAvailable = () => typeof navigator.mediaDevices?.getUserMedia === "function";

interface CameraScanProps {
  /** A barcode was found and named. */
  onName: (name: string) => void;
  /** Words were read: what to search for. */
  onSearches: (searches: string[]) => void;
  /** Pick a photo from the phone instead. */
  onChoosePhoto: () => void;
  onClose: () => void;
}

export function CameraScan({ onName, onSearches, onChoosePhoto, onClose }: CameraScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>(() => (cameraAvailable() ? "starting" : "blocked"));
  const [note, setNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  // While a barcode is being looked up or words read, scanning waits.
  const busy = useRef(false);
  // A barcode already looked up isn't asked about again while it's in view.
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!cameraAvailable()) return;
    let stream: MediaStream | null = null;
    let closed = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        stream = s;
        if (closed) return s.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = s;
        return video.play().then(() => setState("live"));
      })
      .catch(() => {
        if (!closed) setState("blocked");
      });
    return () => {
      closed = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (state !== "live") return;
    const timer = setInterval(async () => {
      const video = videoRef.current;
      if (busy.current || !video || !video.videoWidth) return;
      busy.current = true;
      try {
        const code = await findBarcode(frameCanvas(video, SCAN_SIDE));
        if (!code || tried.current.has(code)) return;
        tried.current.add(code);
        setNote("Found a barcode, looking it up…");
        const name = await api.barcode(code);
        if (name) onName(name);
        else setNote("We don't know that barcode yet. Point at the name on the pack and tap Read the words.");
      } catch {
        // A misread or a failed lookup: keep scanning.
        setNote(null);
      } finally {
        busy.current = false;
      }
    }, SCAN_EVERY_MS);
    return () => clearInterval(timer);
  }, [state, onName]);

  const readWords = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || reading) return;
    busy.current = true;
    setReading(true);
    setNote(textReaderLoaded() ? "Reading the words…" : "Getting the reader ready, then reading the words…");
    try {
      const searches = await readSearches(frameCanvas(video));
      if (searches.length > 0) return onSearches(searches);
      setNote("Couldn't read any words. Hold them level and close, in good light, and try again.");
    } catch (err) {
      console.error(err);
      setNote("Couldn't get the reader. Check your connection and try again.");
    } finally {
      busy.current = false;
      setReading(false);
    }
  };

  return (
    <div className="scan" role="dialog" aria-label="Search with the camera">
      <video ref={videoRef} className="scan-video" playsInline muted aria-hidden="true" />
      <button className="scan-close" aria-label="Close the camera" onClick={onClose}>
        <CloseIcon />
      </button>

      {state === "live" && <div className="scan-frame" aria-hidden="true" />}

      <div className="scan-bottom">
        {state === "starting" && <p className="scan-note">Starting the camera…</p>}
        {state === "blocked" && (
          <p className="scan-note" role="alert">
            The camera isn't available. Allow Accucery to use it in your browser's settings, or choose a photo instead.
          </p>
        )}
        {state === "live" && (
          <p className="scan-note" role="status">
            {note ?? "Point at a barcode, or at words and tap Read the words."}
          </p>
        )}
        <div className="scan-actions">
          <button className="btn btn-ghost scan-choose" onClick={onChoosePhoto}>
            Choose a photo
          </button>
          {state === "live" && (
            <button className="btn btn-primary scan-read" disabled={reading} onClick={() => void readWords()}>
              {reading ? "Reading…" : "Read the words"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
