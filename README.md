# Agri-Netra

## What it is

Agri-Netra is a web app for farmers. You upload or capture a crop leaf photo, run disease detection with an on-device TensorFlow.js model, and get irrigation recommendations using the FAO-56 Penman-Monteith ET0 formula with live weather data.

Disease detection runs on your device. Once the app and its model have loaded, scanning needs no internet connection (see [Limitations](#limitations) for what is not available offline).

## Tech

Built with React 19, Vite, TensorFlow.js, OpenWeatherMap API, and Recharts.

Weather needs the small api/weather.js serverless proxy; disease detection needs no backend.

## Getting started

```bash
git clone <your-repo-url>
cd Agri-Netra
npm install
```

Weather requests go through a small server-side proxy (`api/weather.js`), so the OpenWeatherMap key never reaches the browser. Copy `.env.example` to `.env` and add your key, then either run everything in Docker (`docker compose up --build`, then open http://localhost:8080) or locally in two terminals with `npm run dev:api` and `npm run dev`. On Vercel, set `OPENWEATHER_API_KEY` as an environment variable instead.

The model files already ship in `public/model/` (see [Model files](#model-files)), so there is nothing extra to download.

```bash
npm run dev
```

## Model files

The pre-trained model in `public/model/` (a MobileNet classifier for 38 PlantVillage classes) comes from `github.com/Rishit-dagli/Greenathon-Plant-AI`. It was not trained in this project. See that repository for its training details and license.

## How it works

Disease detection pipeline: an image is preprocessed into a model-ready tensor, then passed to the TensorFlow.js model in the browser. Scores are mapped to class labels and treatment/prevention info, and low-confidence scans are rejected with a retry message.

Irrigation calculation: the app fetches current weather, computes ET0 with the FAO-56 Penman-Monteith method, then applies crop coefficient (Kc) by growth stage. Soil moisture (Dry / Moist / Wet) decides the advice: skip, check tomorrow, or irrigate. The app reports today’s crop water use but does not claim an amount to apply, because that would need the soil type and root depth.

Offline capability: once the page and model files have loaded in a browser tab, disease inference runs locally with no network calls. This is not an installable offline app (there is no service worker), so opening it without internet does not work. Irrigation always needs internet because weather data is live.

Scan history in localStorage: successful scan results are saved locally and shown on the dashboard. No cloud sync is used, so data stays on the device/browser.

## Limitations

- **Disease model:** it was trained on PlantVillage-style data (clean leaf photos on plain backgrounds). Accuracy on real field photos is lower, and this repository does not yet include an evaluation of the model.
- **Supported classes:** only the 38 crop-disease classes in `public/model/class_indices.json`. Blueberry, raspberry and soybean have only a healthy class, and orange and squash have only one disease class, so results for those crops can be wrong.
- **Confidence is not severity:** the percentage shown is the model's score for its answer, not how badly the plant is affected. Scans below 85% confidence are rejected; that cut-off is a rule of thumb, not a guarantee.
- **Irrigation:** crop water use is estimated from current weather readings and an estimated daily sunlight value, not measured. The skip / check / irrigate advice is a simple rule based on the soil moisture you report.
- **Treatment advice:** the treatment and prevention text is general information, not professional advice. Check local rules and consult an agronomist or your agricultural extension service before applying any chemical.
