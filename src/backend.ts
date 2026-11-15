import { callable } from "@decky/api";
import {
  BwInstallState,
  CurrentEntryDetails,
  Entry,
  SetupState,
  UpdateInfo,
  VaultStatus,
} from "./interfaces";

type BeEntry = [string, string, boolean, string[]];
type BeSetupState = [boolean, VaultStatus, string | null, string | null];

export const openPasswordManagerBe = callable<[string], string>("open_password_manager");
export const closePasswordManagerBe = callable<[], void>("close_password_manager");
export const syncBe = callable<[string], void>("sync");

export const getEntriesBe = callable<[string], BeEntry[]>("get_entries");
export const getEntryDetailsBe = callable<[string, string], [string, string]>(
  "get_entry_details"
);

// Last argument: whether this is a user action (counts against auto-lock)
export const getEntryTotpBe = callable<[string, string, boolean], [string, number]>(
  "get_entry_totp"
);

export const touchBe = callable<[string], void>("touch");
export const getAutoLockMinutesBe = callable<[], number>("get_auto_lock_minutes");
export const setAutoLockMinutesBe = callable<[number], void>("set_auto_lock_minutes");

export const checkSetupStateBe = callable<[], BeSetupState>("check_setup_state");

export const checkBwInstallStateBe = callable<[], BwInstallState>(
  "check_bw_install_state"
);
export const installBwBe = callable<[], void>("install_bw");

export const configureServerBe = callable<[string], void>("configure_server");
export const loginApiKeyBe = callable<[string, string], void>("login_apikey");
export const loginPasswordBe = callable<
  [string, string, number | null, string | null],
  [string, string]
>("login_password");
export const logoutBe = callable<[], void>("logout");

export const checkForUpdateBe = callable<[boolean], [string, UpdateInfo | null]>(
  "check_for_update"
);

// Decky's own installer: shows its confirmation prompt, downloads the zip,
// verifies the SHA-256 and replaces the installed plugin folder.
const PLUGIN_INSTALL_TYPE_UPDATE = 2;

export const installUpdate = (update: UpdateInfo): Promise<void> =>
  window.DeckyBackend.call(
    "utilities/install_plugin",
    update.url,
    "DeckWarden",
    update.version,
    update.sha256,
    PLUGIN_INSTALL_TYPE_UPDATE
  );

export const mapBeEntriesToEntries = (beEntries: BeEntry[]): Entry[] => {
  return beEntries
    .map(([id, path, hasTotp, uris]) => {
      const entryParts = path.split("/");

      const title = entryParts.slice(-1)[0];

      const folderPath =
        entryParts.length > 1 ? `${entryParts.slice(0, -1).join("/")}/` : undefined;

      return {
        id,
        path,
        title,
        folderPath,
        hasTotp,
        uris,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path))
    .sort((a, b) => {
      const aHasFolder = !!a.folderPath;
      const bHasFolder = !!b.folderPath;

      if (aHasFolder && !bHasFolder) return 1;
      if (!aHasFolder && bHasFolder) return -1;

      return 0;
    });
};

export const mapBeEntryDetailsToCurrentEntryDetails = (
  beEntryDetails: [string, string]
): CurrentEntryDetails => {
  const [username, password] = beEntryDetails;

  return {
    username,
    password,
  };
};

export const mapBeSetupStateToSetupState = (beSetupState: BeSetupState): SetupState => {
  const [bwInstalled, status, serverUrl, userEmail] = beSetupState;

  return {
    bwInstalled,
    status,
    serverUrl,
    userEmail,
  };
};
