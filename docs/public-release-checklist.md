# Public Release Checklist

Use this checklist after the public-release preparation commit has been pushed.
The repository should remain private until every item below is complete.

## 1. Review Ownership And Attribution

1. Open `LICENSE` and confirm that `BHEAU Projects` is the copyright holder you
   want shown publicly. Change it before publication if the code should instead
   be owned by you personally or by another legal entity.
2. Read `NOTICE.md` and confirm the unofficial-project disclaimer and third-party
   attribution are accurate.
3. Confirm that no private team exports, battle logs, screenshots, credentials,
   or personal data have been added since the last audit.

## 2. Confirm The Release Commit

1. Open the repository's **Actions** tab on GitHub.
2. Open the newest **CI** run for `main`.
3. Confirm that **Install dependencies**, **Type-check**, **Test**, and
   **Audit production dependencies** are green.
4. Do not make the repository public while the newest CI run is failing.

## 3. Enable Security Features

1. Open the repository on GitHub.
2. Select **Settings**.
3. In the **Security** section, select **Advanced Security**.
4. Enable **Dependency graph** if GitHub allows it while the repository is
   private.
5. Enable **Dependabot alerts**.
6. Enable **Dependabot security updates**.
7. Enable **Secret scanning** and **Push protection** when those controls are
   available for the organization and plan.
8. After the repository is public, return to this page and enable
   **Private vulnerability reporting**. This makes the reporting instructions in
   `SECURITY.md` usable without exposing a report in a public issue.

The committed `.github/dependabot.yml` separately asks Dependabot to propose
weekly version updates. Security alerts and security updates still need the
repository settings above.

## 4. Make The Repository Public

1. Open **Settings** on `BHEAU-Projects/EZPE`.
2. In **General**, scroll to **Danger Zone**.
3. Find **Change repository visibility** and select **Change visibility**.
4. Select **Public**.
5. Read GitHub's warning: the source, Actions history, and logs become visible,
   and anyone can fork the repository.
6. Confirm the repository name when GitHub asks.
7. Select **I have read and understand these effects**.
8. Select **Make this repository public**.

If the visibility control is unavailable, a BHEAU Projects organization owner
must either perform this step or allow members to change repository visibility.

## 5. Verify The Public Repository

1. Open the repository in a private browser window and confirm it loads without
   signing in.
2. Confirm the repository header detects the MIT license and displays the
   description and topics.
3. Open **Actions** and confirm the public workflow history contains no secrets
   or private information.
4. Open **Security and quality**, then verify that the security policy,
   Dependabot, and private vulnerability reporting are available.
5. Clone the public repository into a temporary folder and run:

   ```bash
   npm ci
   npm run typecheck
   npm test
   npm audit --omit=dev
   ```

6. Start the app with `npm run dev`, open `http://127.0.0.1:4173`, and confirm
   the setup and battle screens load.

## 6. Keep The Local-Only Boundary

The current Fastify server binds to `127.0.0.1` and has no authentication, TLS,
rate limiting, or multi-user isolation. A public source repository is safe; a
publicly reachable running server is a different security decision. Do not bind
the app to `0.0.0.0`, forward its port, or deploy it to the internet until those
controls have been designed and reviewed.
