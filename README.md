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

That's it — the page works immediately in **local mode** (see below) if
you skip step 2, where each person's spots are saved only in their own
browser. To actually share spots with friends, fill in `site-config.js`
as above and set up a token (next section).

## 2. Turn on shared sync (recommended)

Spots can be stored right in this repo, in `data/spots.json`, so that
everyone using the page sees the same list.

1. Open the page and click the gear icon (**Setup & sync**).
2. Choose **Shared (GitHub)**.
3. Fill in:
   - **Repo owner** — your GitHub username or org.
   - **Repo name** — the repo you created above.
   - **Branch** — usually `main`.
   - **Personal access token** — needed only to *add, edit, or delete*
     spots. Anyone can read the list without one.
4. Click **Save & sync**.

### Creating a token

Anyone in your crew who wants to add/edit/delete spots needs their own
[fine-grained personal access token](https://github.com/settings/personal-access-tokens/new):

- **Repository access**: "Only select repositories" → pick this repo.
- **Permissions**: under "Repository permissions", set **Contents** to
  **Read and write**.
- Copy the generated token and paste it into the Setup & sync panel. It's
  saved only in that browser's local storage, never anywhere else.

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

## 3. Local-only mode

If you don't want to deal with tokens, choose **This device only** in
Setup & sync. Everything is stored in your browser's local storage. Use the
**Export / Import** buttons there to move your list between devices or
hand a `spots.json` file to a friend.

## Using the app

- **Map view / List view** — on mobile, switch with the tabs at the
  bottom. On desktop both are always visible.
- **Add a spot** — tap the `+` button, fill in a name, description,
  1–10 photos, and tags, then either type coordinates or hit
  **Pick on map** and tap the spot's location.
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
