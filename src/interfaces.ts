export type VaultStatus = "unauthenticated" | "locked" | "unlocked";

export type SetupState = {
  bwInstalled: boolean;
  status: VaultStatus;
  serverUrl: string | null;
  userEmail: string | null;
};

export type Entry = {
  id: string;
  path: string;
  title: string;
  folderPath?: string;
  hasTotp: boolean;
};

export type CurrentEntryDisplayMode = "copy" | "full";

export type CurrentEntryDetails = {
  username: string;
  password: string;
};

export type PasteableDetail = keyof CurrentEntryDetails | "totp";

export type TotpCode = {
  code: string;
  remainingSeconds: number;
};

export type CurrentEntry = Entry & {
  displayMode: CurrentEntryDisplayMode;
};

export type BwInstallState = "initial" | "installing" | "done" | "error";

// bw two-step login provider types that work without a browser
export type TwoFactorMethod = 0 | 1 | 3;

export type PasswordLoginResult =
  | "unlocked"
  | "code_required"
  | "method_required"
  | "error";
