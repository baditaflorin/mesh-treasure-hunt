import { useEffect, useState } from "react";
import {
  MeshNameInput,
  PersonalQR,
  useQRScanner,
  parseScanPayload,
  makeScanPayload,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
type Player = { name: string; progress: number; finishedAt: number | null };

const NAME_KEY = (p: string) => `${p}:displayName`;

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="viral-screen">
        <h1>treasure hunt</h1>
        <p className="viral-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [stepsInput, setStepsInput] = useState("5");
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    const meta = room.doc.getMap<number>("meta");
    const players = room.doc.getMap<Player>("players");
    const cb = () => rerender((n) => n + 1);
    meta.observe(cb);
    players.observe(cb);
    return () => {
      meta.unobserve(cb);
      players.unobserve(cb);
    };
  }, [room]);

  const meta = room.doc.getMap<number>("meta");
  const players = room.doc.getMap<Player>("players");
  const totalSteps = Number(meta.get("totalSteps") ?? 0);

  const setHunt = () => {
    const n = parseInt(stepsInput, 10);
    if (!Number.isFinite(n) || n < 1) return;
    meta.set("totalSteps", n);
  };

  const myPlayer = players.get(room.peerId);

  const claimStep = (idx: number) => {
    if (!name.trim() || !totalSteps) return;
    const current = myPlayer?.progress ?? 0;
    if (idx !== current + 1) {
      setError(`expected step ${current + 1} but scanned ${idx}`);
      return;
    }
    setError(null);
    const next: Player = {
      name: name.trim(),
      progress: idx,
      finishedAt: idx === totalSteps ? Date.now() : null,
    };
    players.set(room.peerId, next);
  };

  const scanner = useQRScanner({
    onScan: (r) => {
      const parsed = parseScanPayload(r.text);
      if (!parsed) {
        setError("not a treasure hunt QR");
        return;
      }
      if (parsed.peerId !== "STEP") {
        setError("not a step QR (expected STEP marker)");
        return;
      }
      const idx = parseInt(parsed.extra ?? "", 10);
      if (Number.isFinite(idx)) {
        claimStep(idx);
        scanner.stop();
        setShowScanner(false);
      }
    },
  });

  const myPayload = makeScanPayload(room.roomId, room.peerId, name.trim() || "anon");

  // Step-poster QRs (organizer prints these on paper)
  const stepQRs =
    totalSteps > 0
      ? Array.from({ length: totalSteps }, (_, i) =>
          makeScanPayload(room.roomId, "STEP", String(i + 1)),
        )
      : [];

  const allPlayers: Array<Player & { id: string }> = [];
  players.forEach((p, k) => allPlayers.push({ ...p, id: k }));
  const finished = allPlayers
    .filter((p) => p.finishedAt !== null)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  const inProgress = allPlayers
    .filter((p) => p.finishedAt === null && p.progress > 0)
    .sort((a, b) => b.progress - a.progress);

  return (
    <div className="viral-screen">
      <header>
        <h1>treasure hunt</h1>
        <p className="viral-status">
          {totalSteps > 0
            ? `${totalSteps} steps · ${allPlayers.length} players`
            : "no hunt configured"}
        </p>
      </header>

      <MeshNameInput
        value={name}
        onChange={setName}
        placeholder="your name"
        maxLength={48}
        className="viral-name"
      />

      {totalSteps === 0 && (
        <section>
          <h2 className="viral-section-title">organizer setup — set number of steps</h2>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input
              type="number"
              min="1"
              value={stepsInput}
              onChange={(e) => setStepsInput(e.target.value)}
              className="viral-name"
            />
            <button type="button" className="viral-primary" onClick={setHunt}>
              configure
            </button>
          </div>
        </section>
      )}

      {totalSteps > 0 && (
        <>
          <section>
            <h2 className="viral-section-title">
              progress: {myPlayer?.progress ?? 0}/{totalSteps}
            </h2>
            {myPlayer?.finishedAt ? (
              <p className="th-finish">
                🏆 you finished at {new Date(myPlayer.finishedAt).toLocaleTimeString()}
              </p>
            ) : (
              <button
                type="button"
                className="viral-primary"
                disabled={!name.trim()}
                onClick={() => {
                  if (showScanner) {
                    scanner.stop();
                    setShowScanner(false);
                  } else {
                    setShowScanner(true);
                    void scanner.start();
                  }
                }}
              >
                {showScanner ? "✗ stop" : `📷 scan step ${(myPlayer?.progress ?? 0) + 1}`}
              </button>
            )}
            {showScanner && (
              <video
                ref={scanner.videoRef}
                muted
                playsInline
                autoPlay
                className="mesh-qrx-video"
                style={{ marginTop: "0.5rem" }}
              />
            )}
            {error && <p className="mesh-qrx-error">{error}</p>}
            <details style={{ marginTop: "0.5rem" }}>
              <summary>paste a step payload</summary>
              <ManualStep onSubmit={claimStep} />
            </details>
          </section>

          <section>
            <h2 className="viral-section-title">step posters to print</h2>
            <div className="th-posters">
              {stepQRs.map((p, i) => (
                <div key={i} className="th-poster">
                  <strong>step {i + 1}</strong>
                  <PersonalQR payload={p} size={120} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="viral-section-title">🏁 finished ({finished.length})</h2>
            {finished.length === 0 ? (
              <p className="viral-empty">nobody yet</p>
            ) : (
              <ol className="th-board">
                {finished.map((p, i) => (
                  <li key={p.id} className={p.id === room.peerId ? "is-me" : ""}>
                    <span>{i + 1}.</span>
                    <strong>{p.name}</strong>
                    <span>{new Date(p.finishedAt!).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {inProgress.length > 0 && (
            <section>
              <h2 className="viral-section-title">in progress</h2>
              <ul className="th-board">
                {inProgress.map((p) => (
                  <li key={p.id} className={p.id === room.peerId ? "is-me" : ""}>
                    <strong>{p.name}</strong>
                    <span>
                      {p.progress}/{totalSteps}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <details style={{ marginTop: "0.6rem" }}>
        <summary className="viral-section-title">my personal QR</summary>
        <PersonalQR payload={myPayload} size={160} />
      </details>
    </div>
  );
}

function ManualStep({ onSubmit }: { onSubmit: (idx: number) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseScanPayload(v.trim());
        if (parsed?.peerId === "STEP") {
          const idx = parseInt(parsed.extra ?? "", 10);
          if (Number.isFinite(idx)) onSubmit(idx);
        }
        setV("");
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="paste mesh://room/STEP#N"
        className="viral-name"
      />
      <button type="submit" className="viral-ghost" disabled={!v.trim()}>
        claim
      </button>
    </form>
  );
}
