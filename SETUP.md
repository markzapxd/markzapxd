# GitLab contribution snake setup

The profile renders `assets/snake.svg` and `assets/snake-dark.svg` from the
authenticated activity of GitLab user `marcelo` (ID `30`) on
`https://git.garten.com.br`. The SVG animation, route solver, and renderer come
from [`Platane/snk`](https://github.com/Platane/snk).

## GitHub Actions

1. Create a GitLab personal access token with only the `read_user` scope.
2. In `markzapxd/markzapxd`, open **Settings → Secrets and variables → Actions**.
3. Add a repository secret named `GITLAB_TOKEN`. Never add its value to a file
   or workflow input.
4. Open **Actions → Update GitLab contribution snake → Run workflow**.

The workflow also runs every day at 05:24 UTC. It installs dependencies with
`npm ci`, tests the collector, generates both themes, validates that the files
contain the original snake animation, and commits only changed SVGs. Concurrent
runs are serialized.

## Local execution

Node.js LTS is required.

```bash
npm ci
GITLAB_TOKEN='<read_user token>' npm run snake:generate
npm run snake:validate
npm test
npm run typecheck
```

`GITLAB_BASE_URL` and `GITLAB_USER_ID` may override the configured instance and
user for local diagnostics. Do not store the token in `.env` or shell history.

## Counting rule

The collector requests the 365 UTC dates ending today from
`GET /api/v4/users/30/events`, follows every pagination link, and deduplicates
rows by event ID. Each visible GitLab event counts as one contribution on the
UTC date of `created_at`. A push event therefore counts once, regardless of
`push_data.commit_count`; bulk pushes can report zero commits. Empty dates are
filled with zero. Non-zero intensity levels 1 through 4 are proportional to the
largest daily count in the current window.

These values can differ from GitLab's official calendar. The Events API omits
some merge request and epic activity, returns only activity visible to the
token, and can aggregate bulk pushes. No project names, titles, or other event
details are written to the SVGs.

The current `snk` GitLab provider supports a custom host, but it reads the
public `/users/:username/calendar.json` endpoint. That endpoint returns an empty
object on this instance and accepts no API token. The local adapter supplies the
authenticated, aggregated counts to the unmodified `snk` animation pipeline.

## Troubleshooting

- **HTTP 401 or 403:** replace `GITLAB_TOKEN` and confirm its `read_user` scope
  and access to user ID `30`.
- **Timeout, HTTP 429, or HTTP 5xx:** the client retries transient failures with
  backoff and honors `Retry-After`. The job fails after the retry limit.
- **No events:** generation fails before writing files, so existing SVGs remain
  intact. Confirm the token can see activity in the last 365 UTC dates.
- **Push rejected:** enable read/write workflow permissions and check branch
  protection rules.
- **Invalid SVG:** run `npm test` and `npm run snake:validate`; validation
  requires SVG structure, CSS keyframes, snake segments, and animation bindings.
