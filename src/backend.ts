import { callable } from "@decky/api";
import {
  BwInstallState,
  CurrentEntryDetails,
  Entry,
  SetupState,
  VaultStatus,
} from "./interfaces";

type BeEntry = [string, string, boolean];
type BeSetupState = [boolean, VaultStatus, string | null, string | null];

export const openPasswordManagerBe = callable<[string], string>("open_password_manager");
export const closePasswordManagerBe = callable<[], void>("close_password_manager");
export const syncBe = callable<[string], void>("sync");

export const getEntriesBe = callable<[string], BeEntry[]>("get_entries");
export const getEntryDetailsBe = callable<[string, string], [string, string]>(
  "get_entry_details"
);

export const getEntryTotpBe = callable<[string, string], [string, number]>(
  "get_entry_totp"
);

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

export const mapBeEntriesToEntries = (beEntries: BeEntry[]): Entry[] => {
  return beEntries
    .map(([id, path, hasTotp]) => {
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
