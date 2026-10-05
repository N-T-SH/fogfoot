# Testing fogfoot capture on real phones

We need numbers from cheap Android phones and from iPhones. You do **not** need to walk for the first test.

## 1-minute check (anyone, any phone)

1. Open the test link on the phone: https://fogfoot.vercel.app/#/spike (the capture test page; the pick-up prototype is at the plain address).
2. Tap **Quick device check (30 s)**. Allow the camera when asked and point it at anything. If you prefer not to allow the camera, it still works with a built-in test picture.
3. Wait about 30 seconds until it says "Done".
4. Tap **Share report** and send it to us (WhatsApp works). If sharing isn't offered, tap **Copy report** and paste it into a message.

Please also tell us the phone model (for example "Redmi 9A, 2 GB RAM") and how old it is.

## 20-minute walk (if you can)

1. Install the app first: on Android use the browser menu, **Install app**; on iPhone use Safari, **Share**, **Add to Home Screen**. Open it from the new icon.
2. Unplug the charger. Note the battery percentage.
3. Tap **Start walk** and allow camera, location and motion. Hold the phone at chest height, camera facing forward.
4. Walk about 300 m to 2 km, ideally on a street with buildings on both sides.
5. Tap **Stop**, then **Share report**.

Optional comparison: repeat with `?worker=0` added to the link (`https://fogfoot.vercel.app/?worker=0#/spike`), which uses the older method.

## Getting devices without owning them

- Ask friends and family. The most useful phones are the cheapest ones (2 to 3 GB RAM, bought in the last 5 years) and any iPhone on iOS 16.4 or newer.
- Real-device cloud services (BrowserStack, LambdaTest and similar) let you open the link on real phones for a few minutes. They are good for the Quick device check and for iPhone browser compatibility, but can't do a real walk or reliable camera feed.
- A used Redmi A-series or similar costs roughly 5,000 to 8,000 rupees and is the single best investment for this project.

## What we are looking for

| Measure | Good | Problem |
|---|---|---|
| Main thread, ms per frame (avg) | under 60 | over 150 |
| Long stalls in 20 frames | under 5 | 20 (every frame) |
| Worker supported | yes | not supported (iOS before 16.4) |
| Frame size | about 70 KB | over 100 KB |
