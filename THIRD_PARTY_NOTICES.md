# Data and asset attribution

Surfay's original application code is licensed under MIT. This does not
relicense external data, dependencies, imagery or services.

| Material | Source and licence | Changes in Surfay |
| --- | --- | --- |
| Coastline/exposure profiles and optional geometry tiles | Instituto Hidrográfico de la Marina (IHM), **LC 2023 CC BY 4.0**. [CNIG catalogue](https://centrodedescargas.cnig.es/CentroDescargas/linea-costa), [licence](https://creativecommons.org/licenses/by/4.0/). | Galicia subset, rounded coordinates, tile indexing, ray-derived exposure. COALNE and SLCONS obstruct rays; DEPCNT is a research display layer. |
| Bathymetric transfer table | EMODnet Bathymetry DTM 2024. [Source portal](https://emodnet.ec.europa.eu/en/bathymetry). The generated table records dataset SHA-256 and solver image. Check the exact download's accompanying attribution and source terms before redistribution of raw data. | Stationary SWAN runs, filtered cases, compact interpolated transfer coefficients. Raw NetCDF is not shipped. |
| Forecasts | [Open-Meteo](https://open-meteo.com/en/terms). Check service-use terms, attribution and commercial access requirements for your deployment. | Normalized UTC hours and an experimental local score. |
| Map tiles/style | [OpenFreeMap](https://openfreemap.org/), OpenStreetMap contributors. Keep the map's provider attribution controls visible. | Overlaid surf spots and forecast markers. |
| Fonts | Fraunces, Karla and Space Mono through Fontsource. Their packages include the upstream font licences (SIL Open Font License). | Self-hosted font files. |
| Webcam links | Camaramar URLs point to external services. No camera footage is bundled or relicensed. | External links only. |

The original social preview and favicon use procedural wave artwork licensed
with the application code. `scripts/generate-social-card.py` regenerates
`public/og.png` with Pillow. Its text uses locally installed DejaVu fonts when
available (font binaries are not distributed). The unused hero image and the
previous social preview, whose provenance was undocumented, were removed or
replaced. Their rights have not been confirmed. Private development history
still contains them; do not redistribute that history without permission.
The clean-snapshot export includes only the current tracked tree and starts
a new Git history, excluding those historical images and commits. It retains
the source/data licences above and the original procedural artwork.

The README screenshot is captured from Surfay with synthetic forecast inputs
and real OpenFreeMap cartography. Its map attribution remains visible. It is
an interface example, not evidence of observed conditions or forecast skill.
