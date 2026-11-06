# Notices and sources

SWU Scanner is an unofficial fan project. It is **not** affiliated with, endorsed by or sponsored by
Lucasfilm, Disney, Fantasy Flight Games, Atomic Mass Games or Cardmarket. _Star Wars: Unlimited_ and its
card names and artwork are the property of their respective owners.

## What this repository contains

Source code only (MIT, see `LICENSE`). It contains **no card text, no card images, no price data and no
machine-learning models**. Those are fetched when the site is built (see below) and are not stored in git.

## Data used to build the site

The deployment workflow downloads public data, reduces it to the fields the app needs, and publishes the
result on the site:

| Data                                                        | Source                                                                                    | Used for                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| Card catalog (set, number, variant)                         | the public API of [swu-db.com](https://swu-db.com)                                        | list of printings                     |
| Card titles in English, French, German, Spanish and Italian | the public card list of starwarsunlimited.com                                             | recognition and search                |
| Product list and daily price guide                          | the public download files that Cardmarket publishes for its Star Wars: Unlimited products | prices and links to the product pages |

Card thumbnails are loaded by the visitor's browser directly from `cdn.swu-db.com`, only when a card row is
opened. Nothing is scraped from Cardmarket's web pages. Prices are indicative and may differ from the
current offers on Cardmarket.

## Models and libraries

| Component                                                                                                                  | License          |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| PP-OCRv6 text detection and recognition models (PaddleOCR), as packaged by [RapidOCR](https://github.com/RapidAI/RapidOCR) | Apache-2.0       |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)                                                               | MIT              |
| Build and test tooling (Vite, Vitest, Playwright, axe-core, TypeScript, ESLint, Prettier)                                  | see each package |

The models are downloaded at build time from the RapidOCR release and checked against the SHA-256 hashes
in `scripts/data/models.json`.
