import { createRoot } from "react-dom/client";
import "./ui/styles.css";
import { Landing } from "./ui/Landing";
import { HostApp } from "./ui/host/HostApp";
import { PlayerApp } from "./ui/player/PlayerApp";

function App() {
  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/host") return <HostApp />;
  if (path === "/play") return <PlayerApp />;
  return <Landing />;
}

createRoot(document.getElementById("root")!).render(<App />);
