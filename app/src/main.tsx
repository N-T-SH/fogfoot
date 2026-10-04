import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import "./style.css";
import { Spike } from "./spike/Spike";

registerSW({ immediate: true });
render(<Spike />, document.getElementById("app")!);
