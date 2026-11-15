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
  uris: string[];
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

export type UpdateInfo = {
  version: string;
  url: string;
  sha256: string;
  release_url: string;
};

export type UpdateState = {
  currentVersion: string;
  update: UpdateInfo | null;
};

export type PinState = {
  enabled: boolean;
  hasPin: boolean;
  pinLocked: boolean;
  attemptsLeft: number;
  maxHours: number;
};

export type PinUnlockResult = "unlocked" | "wrong" | "unavailable";
