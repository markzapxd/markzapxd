# Setup — GitHub profile `@markzapxd`

This package was prepared for the public profile `https://github.com/markzapxd`.

## What's included

- `README.md`: a complete cyberpunk-style profile.
- `assets/banner.svg`: a custom vector banner for this profile, with no external service dependencies.
- `assets/snake.svg` and `assets/snake-dark.svg`: previews that will be replaced by the actual animation.
- `.github/workflows/snake.yml`: a workflow that updates the snake daily and can also be run manually.

## Publish on GitHub (using a browser + local Git)

1. Create a **public** repository named exactly `markzapxd` at `https://github.com/new`.
2. Select **Add a README file** when creating the repository.
3. Clone the repository (Git must be configured, and you must have push permissions):

   ```bash
   git clone https://github.com/markzapxd/markzapxd.git
   cd markzapxd
   ```

4. Copy `README.md`, the `assets/` folder, and the `.github/` folder from this package to the root of the cloned repository.
5. Push to GitHub:

   ```bash
   git add README.md assets/ .github/workflows/snake.yml
   git commit -m "feat: personalize GitHub profile"
   git push
   ```

6. At `https://github.com/markzapxd/markzapxd/actions`, enable GitHub Actions if prompted.
7. Run `Update contribution snake` → `Run workflow` once.
8. If generation or committing fails, check `Settings → Actions → General → Workflow permissions`; the workflow token needs write permissions for the repository. Branch protection rules may prevent automated pushes.

The actual snake animation appears only after the first successful run. The statistics cards and typing animation rely on external services and may be subject to rate limits or outages.

## Customize

- Update the text in `README.md` to match your profile.
- Edit `assets/banner.svg` to change the colors, name, or subtitle.
- Reorder the featured repositories. They were selected from the public repositories reviewed in October 2026.
