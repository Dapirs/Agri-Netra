# Agri-Netra

[![CircleCI](https://dl.circleci.com/status-badge/img/gh/Dapirs/Agri-Netra/tree/main.svg?style=shield)](https://dl.circleci.com/status-badge/redirect/gh/Dapirs/Agri-Netra/tree/main)

Agri-Netra is a web app that helps farmers with two everyday questions:

- **Is my crop sick?** Take or upload a photo of a leaf, and the app identifies the disease and tells you what to do about it.
- **Should I water today?** Pick your crop, its growth stage and how wet the soil feels, and the app checks the local weather and tells you to irrigate today, check tomorrow, or skip.

Disease detection runs entirely in the browser, so photos never leave the phone. Only the irrigation advisor needs the internet, to fetch the weather.

## Features

| Screen     | What it does                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scanner    | Camera or photo upload, an on-device disease check, and treatment and prevention steps. Includes photo tips and a list of the crops the model can check, with its limits stated plainly. |
| Irrigation | Uses your location (or coordinates you type in) and live weather to give a clear decision: irrigate today, check tomorrow, or skip. The numbers behind it are one tap away.              |
| Dashboard  | Your crops at a glance (latest status of each), plus your five most recent scans. Tap any scan to see its treatment again.                                                               |

Scan history is stored only in your browser (localStorage). There are no accounts and no cloud storage.

## Run it with Docker (quickest)

Ready-made images are published to Docker Hub for both Intel/AMD (`amd64`) and Apple Silicon/ARM (`arm64`) machines:

- Web app: [dapirs2006/agri-netra](https://hub.docker.com/r/dapirs2006/agri-netra)
- Weather API: [dapirs2006/agri-netra-api](https://hub.docker.com/r/dapirs2006/agri-netra-api)

You need [Docker](https://docs.docker.com/get-docker/) and a free [OpenWeatherMap API key](https://openweathermap.org/api). A new key can take a little while to start working.

**1. Put your key in a `.env` file** (in any empty folder):

```bash
echo "OPENWEATHER_API_KEY=your-key-here" > .env
```

**2. Pull the images:**

```bash
docker pull dapirs2006/agri-netra:latest
docker pull dapirs2006/agri-netra-api:latest
```

**3. Start the two containers on a shared network.** Start the API first: the web container forwards weather requests to a container named `weather-api`, and it needs to find that container when it starts.

```bash
docker network create agri-netra
docker run -d --name weather-api --network agri-netra --env-file .env dapirs2006/agri-netra-api:latest
docker run -d --name agri-netra-web --network agri-netra -p 8080:8080 dapirs2006/agri-netra:latest
```

**4. Open** <http://localhost:8080>.

To stop and clean up:

```bash
docker rm -f agri-netra-web weather-api
docker network rm agri-netra
```

Every image is also tagged with the short commit it was built from (for example `dapirs2006/agri-netra:5fdffe6`), if you need a specific version rather than `latest`.

## Run it from source

You need **Node.js 22.22.2 or newer** (the repo includes an `.nvmrc`, so `nvm use` picks the right version) and an OpenWeatherMap API key.

```bash
git clone https://github.com/Dapirs/Agri-Netra.git
cd Agri-Netra
npm ci
cp .env.example .env   # then open .env and paste your key
```

Then choose one of the two ways below.

**For development (live reload).** Run these in two terminals:

```bash
npm run dev:api   # weather API on http://localhost:3000
npm run dev       # app on http://localhost:5173, forwards /api/weather to the API
```

**As it runs in production.** Build and start both containers with Docker Compose:

```bash
docker compose up --build   # then open http://localhost:8080
```

The disease model already ships in `public/model/`, so there is nothing else to download.

### Useful scripts

| Command                | What it does                                      |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Start the app with live reload                    |
| `npm run dev:api`      | Start the weather API (reads the key from `.env`) |
| `npm test`             | Run the test suite once (Vitest)                  |
| `npm run lint`         | Check the code with ESLint                        |
| `npm run format:check` | Check formatting with Prettier                    |
| `npm run build`        | Build the production app into `dist/`             |

## How it works

**Disease detection.** The photo is resized into the shape the model expects and passed to a MobileNet model running in the browser with TensorFlow.js. The model chooses between 38 crop and disease classes. If it is less than 85% sure, the app asks for a clearer photo rather than guessing. Otherwise it shows the diagnosis, the treatment and prevention steps, and, for any disease, a reminder to confirm with the local Krishi Vigyan Kendra or agriculture officer before buying or spraying chemicals.

**Irrigation advice.** A small API server fetches the current weather from OpenWeatherMap, so the API key stays on the server and never reaches the browser. The app estimates how quickly the weather dries plants out (reference evapotranspiration, ET₀, by the FAO-56 Penman-Monteith method) and multiplies it by a crop factor for the chosen growth stage (Kc) to get the crop's water use for the day. The soil moisture you report (dry, moist or wet) then decides the advice. If the weather service cannot be reached, the app reuses weather it saved for the same place within the last hour, and says so on screen.

**Architecture.**

```
Browser ── React app + TensorFlow.js model (disease detection runs here)
   │
   └─ /api/weather ──► nginx (web container, port 8080)
                          └─► weather API (Node.js, port 3000) ──► OpenWeatherMap
```

```
src/
  components/   screens and UI pieces (Scanner, ResultCard, IrrigationForm, Dashboard, …)
  logic/        ET₀ and irrigation calculations, prediction mapping, weather service
  data/         disease labels, treatment advice, crop coefficients
  hooks/        model loading and photo handling
  storage/      scan history in localStorage
api/            weather proxy handler
server/         Node.js server that runs the handler, and its Dockerfile
public/model/   the TensorFlow.js model files
```

## CI/CD and security

Every push and pull request runs a [CircleCI](.circleci/config.yml) pipeline:

| Job              | What it checks                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`           | ESLint, Prettier formatting, and `npm audit` for high-severity issues in production dependencies                                                                                      |
| `test`           | The full Vitest suite                                                                                                                                                                 |
| `build`          | The production build                                                                                                                                                                  |
| `docker-build`   | Builds both images, starts them, runs smoke tests against the live site (pages, model files, headers, caching), and scans the images with Trivy for high and critical vulnerabilities |
| `secrets-scan`   | Scans the whole git history for leaked keys and tokens with gitleaks                                                                                                                  |
| `docker-publish` | On `main` only, after all of the above pass: builds `amd64` + `arm64` images and pushes them to Docker Hub                                                                            |

A scheduled nightly pipeline also re-scans the published images, so newly discovered vulnerabilities are caught even when the code has not changed.

The images themselves are kept small and locked down: the web image serves the built app with nginx as a non-root user and sends basic security headers; the API image runs Node.js as a non-root user, with npm removed; and the API key is passed in only when the container starts, never built into an image. The security scanners are pinned to exact versions by digest.

## Limitations

- **The disease model was trained on lab-style photos.** It learned from the PlantVillage dataset (single leaves on plain backgrounds), so it is noticeably less accurate on real field photos. This repository does not include a field evaluation of the model.
- **14 crops only.** The model knows apple, bell pepper, blueberry, cherry, corn (maize), grape, orange, peach, potato, raspberry, soybean, squash, strawberry and tomato. For blueberry, raspberry and soybean it can only say whether a leaf looks healthy; for orange and squash it knows one disease and cannot confirm a healthy leaf. Other crops, such as rice, wheat or cotton, are not supported.
- **Confidence is not severity.** The percentage shown is how sure the model is of its answer, not how badly the plant is affected. The 85% cut-off is a rule of thumb, not a guarantee.
- **Irrigation advice is an estimate.** It uses current weather readings and an estimated daily sunlight value rather than measured data, and the decision is a simple rule based on the soil moisture you report. It gives the crop's water use, not an amount to apply, because that would need the soil type and root depth.
- **Treatment advice is general information.** Always confirm with a local agriculture officer or agronomist before applying any chemical.
- **English only for now.** Kannada and Hindi are planned.
- **Not an installable offline app.** Once the page and model have loaded, scanning works without a connection, but the page itself needs the internet to open.

## Credits

The pre-trained disease model in `public/model/` comes from [Rishit-dagli/Greenathon-Plant-AI](https://github.com/Rishit-dagli/Greenathon-Plant-AI). It was not trained as part of this project; see that repository for its training details and licence. Weather data is provided by [OpenWeatherMap](https://openweathermap.org/).
