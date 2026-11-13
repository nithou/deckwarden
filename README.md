# DeckWarden
DeckWarden is a Decky Plugin to access your **self-hosted Vaultwarden** (or any Bitwarden-compatible) vault directly in SteamOS gaming mode.
Internally it uses the official **Bitwarden CLI** (`bw`).

## Inspired by DeckPass
DeckWarden would not exist without **[DeckPass](https://github.com/Teppichseite/DeckPass)** by **[Teppichseite](https://github.com/Teppichseite)**, a Decky plugin for KeePassXC databases.
DeckWarden is a fork of it. The Quick Access Menu UI, the way credentials are pasted into games, the security-token design and the release setup all come from DeckPass; only the KeePassXC backend was swapped for the Bitwarden CLI.

If you use KeePassXC rather than Vaultwarden/Bitwarden, use DeckPass. Please consider giving it a ⭐.

## Features
- Connects to any **Vaultwarden** / Bitwarden server URL
- Logs in once with your **personal API key**; after that you only unlock with your **master password**
- Lists all **login items**, grouped by folder
- Shows credentials and **pastes them into games**
- **Syncs** the vault on demand

DeckWarden is **read-only**: create and edit entries in the Vaultwarden web vault or the Bitwarden apps.

## Plugin Setup
1. Install the plugin from the **releases page**, or **build it yourself**
2. Open DeckWarden in the **Steam Quick Access Menu**
3. Follow the **Setup Guide**:
    1. **Install the Bitwarden CLI**. This downloads a pinned, checksum-verified release (`bw-oss-linux`) from GitHub into the plugin's runtime directory
    2. **Set your server URL**, e.g. `https://vault.example.com`
    3. **Log in with your personal API key** (`client_id` and `client_secret`). Find it in the web vault under *Account Settings → Security → Keys → View API Key*
4. Click **Unlock Vault** and enter your master password

### Self-signed certificates
If your Vaultwarden server uses a certificate from a private CA, copy the CA certificate in PEM format to
`~/homebrew/settings/DeckWarden/ca.pem`. It is passed to the CLI as `NODE_EXTRA_CA_CERTS`.

## Known issues
1. When using **Big Picture mode** in Desktop mode, credential pasting only works within the **Steam interface**, not within games
2. The Bitwarden CLI is a bundled Node.js application, so **unlocking and syncing take a few seconds**
3. Only **login items** are shown. Cards, identities and secure notes are ignored
4. **TOTP codes** are not shown yet

## Security considerations
1. DeckWarden **does not store the master password or the API key**
    1. The API key is only used for the one-time `bw login --apikey`. After that the CLI keeps its own refresh token in its data directory (`~/homebrew/settings/DeckWarden/bw-data`), together with the **encrypted** vault cache, as with any Bitwarden client
2. All secrets are passed to the CLI **through environment variables of the child process, never through command-line arguments**, so they do not show up in the process list
3. After unlocking, the **session key** and the decrypted **login items** are kept **only in memory** of the Python backend. Locking the vault, unloading the plugin or any backend error clears them and runs `bw lock`
4. DeckWarden deliberately does **not** use `bw serve`, because it exposes an unauthenticated REST API on localhost
5. After unlocking, the frontend receives a **security token** (`secrets.token_urlsafe(32)`) that every backend call needs, checked with `hmac.compare_digest`. The token is stored in a scoped variable of the plugin's JavaScript module
6. A malicious program or Decky plugin running as the same user can still read process memory or the CLI data directory under **certain conditions**

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
