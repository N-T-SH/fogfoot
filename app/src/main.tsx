import { render } from "preact";
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });

// Tiny hash router. Each view is its own lazily loaded chunk, so the first load only pays for the view it opens.
//   /            the pick-up prototype (default)       /#/spike   capture viability test (Spike A)
//   /#/icons     the litter icon set                   /#/dots?area=koramangala | ?room=test   options for the prototype
const root = document.getElementById("app")!;
const hash = location.hash;
if (hash.startsWith("#/spike")) import("./spike/Spike").then((m) => render(<m.Spike />, root));
else if (hash.startsWith("#/icons")) import("./dots/IconGallery").then((m) => m.mountIcons(root));
else import("./dots/DotsMap").then((m) => m.mountDots(root));
