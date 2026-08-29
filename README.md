# SPOTS — a shared skate spot map

A single static site (no build step, no server) for you and your friends to
drop pins on a map, add photos and tags, and search/filter spots later.
Works on desktop and mobile, and is meant to be hosted for free on
**GitHub Pages**.

## 1. Get it online

1. Create a new **public** GitHub repository (e.g. `skate-spots`).
2. Open `js/site-config.js` and fill in `owner` and `repo` with your
   GitHub username and this repo's name (e.g. `owner: "alice-skates"`,
   `repo: "skate-spots"`). This is what lets *every* device — phones,
   in-app browsers, whatever — reliably find the shared spot list,
   instead of trying to guess it from the page's own address.
3. Upload every file in this folder to the repo, keeping the folder
   structure (`index.html`, `css/`, `js/`, `data/spots.json`, `.nojekyll`).
4. In the repo, go to **Settings → Pages**, and under "Build and
   deployment" choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
5. After a minute or two your site will be live at
   `https://<your-username>.github.io/<repo-name>/`.

That's it — every visitor now automatically reads the shared spot list
from `data/spots.json` in this repo, no per-device setup required. To let
people *add, edit, or delete* spots, they each need a token (next section).

## 2. Let people add spots (personal access tokens)

Anyone in your crew who wants to add/edit/delete spots needs their own
[fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):

- **Repository access**: "Only select repositories" → pick this repo.
- **Permissions**: under "Repository permissions", set **Contents** to
  **Read and write**.
- On the page, click the gear icon (**Setup & sync**), paste the token in,
  and hit **Save token**. It's saved only in that browser's local storage,
  never anywhere else — everyone reads the same `owner/repo` from
  `site-config.js`; the token is the only thing each device stores for itself.

The Setup & sync panel also shows which `owner/repo` the page resolved to,
which is a handy first thing to check if a device isn't seeing the shared
list — it should match your repo exactly.

⚠️ Because this is a static site, the token is used directly from the
browser to call the GitHub API. Don't use a token with more access than it
needs (scope it to this one repo), and don't paste it into a shared or
public computer.

### How it works under the hood

- Reading the spot list is a plain (unauthenticated) request to the GitHub
  API, so it works for anyone, token or not.
- Adding/editing a spot writes the whole `data/spots.json` file back via a
  commit, and each photo is committed as its own file under `images/`
  (resized and compressed in the browser first, so a phone photo doesn't
  turn into a multi-MB commit).
- Every commit shows up in the repo's history — a free changelog of who
  added what, when.
- If two people save at almost the same moment, GitHub will reject the
  second write; that person just needs to retry (the app refetches
  automatically on the next save).
- If `js/site-config.js` is left blank (skipped step 2 above), the page
  quietly falls back to saving spots only in that one browser, so it never
  fully breaks — but nobody will see each other's spots until it's filled in.

## Using the app

- **Map view / List view** — on mobile, switch with the tabs at the
  bottom. On desktop both are always visible.
- **Add a spot** — tap the `+` button, fill in a name, description,
  up to 10 photos (optional), and tags, then either type coordinates or
  hit **Pick on map** and tap the spot's location.
- **Search & filter** — the search bar matches name and description;
  tap tag chips in the strip below the header to filter by obstacle type.
- **Edit / delete** — open a spot (from the map or the list) to see the
  full detail view with those options.

## Customizing

- Colors, fonts and spacing are all CSS variables at the top of
  `css/style.css`.
- The list of suggested obstacle tags lives in `COMMON_TAGS` near the top
  of `js/app.js` — edit freely.
- `data/spots.json` is just a plain JSON array — safe to hand-edit or
  seed with starting spots before you launch.
