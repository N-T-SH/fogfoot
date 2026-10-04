import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import "./style.css";
import { Spike } from "./spike/Spike";

registerSW({ immediate: true });

// Tiny hash router. The dots concept lives in its own lazily loaded chunk so the main bundle stays small.
const root = document.getElementById("app")!;
if (location.hash.startsWith("#/dots")) import("./dots/DotsMap").then((m) => m.mountDots(root));
else render(<Spike />, root);
