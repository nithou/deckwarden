# DeckWarden
DeckWarden is a Decky Plugin to access your **self-hosted Vaultwarden** (or any Bitwarden-compatible) vault directly in SteamOS gaming mode.
Internally it uses the official **Bitwarden CLI** (`bw`).

## Inspired by DeckPass
DeckWarden would not exist without **[DeckPass](https://github.com/Teppichseite/DeckPass)** by **[Teppichseite](https://github.com/Teppichseite)**, a Decky plugin for KeePassXC databases.
DeckWarden is a fork of it. The Quick Access Menu UI, the way credentials are pasted into games, the security-token design and the release setup all come from DeckPass; only the KeePassXC backend was swapped for the Bitwarden CLI.

If you use KeePassXC rather than Vaultwarden/Bitwarden, use DeckPass. Please consider giving it a ⭐.

## Features
- Connects to any **Vaultwarden** / Bitwarden server URL
- Logs in once with your **email and master password** (with optional two-step code) or your **personal API key**; after that you only unlock with your **master password**
- Lists all **login items**, grouped by folder, with a **search field** (matches names, folders and URLs)
- Shows credentials and **pastes them into games**
- Shows and pastes **TOTP codes** (standard `otpauth://`, raw base32 and Steam Guard `steam://` secrets)
- **Syncs** the vault on demand
- **Auto-locks** the vault after a configurable time without use (default 15 minutes)
- Optional **PIN unlock** after the master password has been entered once
- Offers **updates** from this repository's GitHub releases

DeckWarden is **read-only**: create and edit entries in the Vaultwarden web vault or the Bitwarden apps.

## Plugin Setup
1. Install the plugin from the **releases page**, or **build it yourself**
2. Open DeckWarden in the **Steam Quick Access Menu**
3. Follow the **Setup Guide**:
    1. **Install the Bitwarden CLI**. This downloads a pinned, checksum-verified release (`bw-oss-linux`) from GitHub into the plugin's runtime directory
    2. **Set your server URL**, e.g. `https://vault.example.com`
    3. **Log in**, using one of two methods:
        - **Email & master password**. If two-step login is enabled, pick the method (authenticator app, email or YubiKey OTP) and enter the code; for email, use *Send code by email* first. Logging in this way also unlocks the vault
        - **Personal API key** (`client_id` and `client_secret`), from the web vault under *Account Settings → Security → Keys → View API Key*. Each field has a clipboard button; pasting the whole dialog text fills both fields. Use this if your account uses **FIDO2/WebAuthn or Duo**, which the CLI cannot handle, or if the server asks for **new device verification**
4. Click **Unlock Vault** and enter your master password

### PIN unlock
Optional, off by default (**Settings → Unlock with PIN**). After you first unlock with your master password, DeckWarden asks for a 4 to 8 digit PIN; you can change it later with **Settings → Change PIN** while the vault is open. When the vault then locks (manually or by auto-lock), **Unlock with PIN** gets you back in. The PIN is remembered, so you never have to set it again; but the master password is required again first:
- after **5 wrong PINs**,
- after the chosen time since the last master password unlock (1, 4, 8 or 24 hours, or only on restart; default 8 hours),
- after a **restart** of the Deck or Decky, since the vault session only lives in memory,
- when you press **Lock completely**.

Turning the option off deletes the PIN.

The Bitwarden CLI has no PIN support, so DeckWarden implements it the way the Bitwarden apps do; see the security notes below.

### Updates
Decky only checks for updates of plugins from its own store, so DeckWarden checks this repository's **latest GitHub release** itself (at most every hour, or with **Check for updates**). When a newer version is out, an **Update** button appears at the top of the plugin. It hands the release ZIP and its SHA-256 to **Decky's own installer**, which asks for confirmation, verifies the hash and replaces the installed version. Your login and settings are kept.

### Self-signed certificates
If your Vaultwarden server uses a certificate from a private CA, copy the CA certificate in PEM format to
`~/homebrew/settings/DeckWarden/ca.pem`. It is passed to the CLI as `NODE_EXTRA_CA_CERTS`.

## Known issues
1. When using **Big Picture mode** in Desktop mode, credential pasting only works within the **Steam interface**, not within games
2. The Bitwarden CLI is a bundled Node.js application, so **unlocking and syncing take a few seconds**
3. Only **login items** are shown. Cards, identities and secure notes are ignored

## Security considerations
1. DeckWarden **does not store the master password or the API key**
    1. The API key is only used for the one-time `bw login --apikey`. After that the CLI keeps its own refresh token in its data directory (`~/homebrew/settings/DeckWarden/bw-data`), together with the **encrypted** vault cache, as with any Bitwarden client
2. The master password and API key are passed to the CLI **through environment variables of the child process, never through command-line arguments**, so they do not show up in the process list. The CLI has no such option for the email address and the one-time two-step code, so these two are passed as arguments, after validation
3. After unlocking, the **session key** and the decrypted **login items** are kept **only in memory** of the Python backend. **Auto-lock** (Never, 5, 10, 15, 30 or 60 minutes; default 15) is enforced by the backend, so it also works while the Quick Access Menu is closed. Unlocking, opening the plugin, showing or pasting credentials and syncing count as use; the on-screen TOTP refresh does not. TOTP codes are computed in the backend; TOTP secrets are never sent to the frontend. Locking the vault, unloading the plugin or any backend error clears them and runs `bw lock`
4. **PIN unlock** keeps the CLI **session key in memory** while PIN-locked (decrypted items and the security token are dropped). This is the same trade-off as PIN unlock in the Bitwarden apps: anyone able to read the plugin's memory while PIN-locked could decrypt the vault, just as while it is unlocked. The PIN is stored only as a salted `scrypt` hash, in the plugin settings file, and never reaches the CLI. The PIN alone opens nothing: it only works while a session opened with the master password is held in memory. Its protection is the **5-attempt limit** enforced by the backend, not the hash: someone who can read the settings file could brute-force a short PIN offline, so **don't reuse a PIN you use elsewhere**. Leave the option off if that matters to you.
5. DeckWarden deliberately does **not** use `bw serve`, because it exposes an unauthenticated REST API on localhost
6. After unlocking, the frontend receives a **security token** (`secrets.token_urlsafe(32)`) that every backend call needs, checked with `hmac.compare_digest`. The token is stored in a scoped variable of the plugin's JavaScript module
7. A malicious program or Decky plugin running as the same user can still read process memory or the CLI data directory under **certain conditions**

## Communication between DeckWarden and the Bitwarden CLI

### Unlocking
1. The master password is entered in the frontend and sent **in plain text** to the Python backend
2. The backend runs `bw unlock --passwordenv BW_PASSWORD --raw` with the password in the child's environment and receives a **session key**
3. The backend runs `bw sync`, `bw list folders` and `bw list items` with `BW_SESSION` set, and keeps the login items in memory
4. The backend generates the **security token** and returns it to the frontend

### Listing and pasting
1. The frontend requests the entry list (IDs and folder paths) using the token
2. When credentials are shown or pasted, the frontend requests that single entry's username and password by its ID
3. To paste, the frontend closes the **Quick Access Menu** and calls `SteamClient.Input.ControllerKeyboardSendText(char)` for each character of the credential

## Building and Deployment

To properly build and deploy the plugin manually please refer to this guide: https://magicpods.app/blog/post-11/

## Acknowledgments
1. **DeckPass** by Teppichseite. DeckWarden is based on its UI, pasting and security-token design: https://github.com/Teppichseite/DeckPass
2. **Release workflow** taken from https://github.com/aarron-lee/SimpleDeckyTDP/blob/main/.github/workflows/release.yml
3. **Bitwarden CLI**: https://github.com/bitwarden/clients
