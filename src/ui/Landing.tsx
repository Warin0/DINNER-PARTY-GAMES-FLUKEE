import { useState } from "react";

export function Landing() {
  const [code, setCode] = useState("");
  return (
    <div className="page center">
      <div className="hero">
        <div className="herologo">🎨</div>
        <h1>Draw &amp; Guess</h1>
        <p className="muted">One big screen, up to 80 phones. Draw the secret word — everyone else races to guess it.</p>
      </div>
      <div className="card stack">
        <a className="btn big" href="/host">📺 Host on the big screen</a>
        <div className="divider">or join a game</div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) location.href = `/play?room=${code.trim().toUpperCase()}`;
          }}
        >
          <input
            className="input code"
            placeholder="ROOM CODE"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="btn alt big" type="submit">📱 Join</button>
        </form>
      </div>
    </div>
  );
}
