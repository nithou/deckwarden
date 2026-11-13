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
};

export type CurrentEntryDisplayMode = "copy" | "full";

export type CurrentEntryDetails = {
  username: string;
  password: string;
};

export type CurrentEntry = Entry & {
  displayMode: CurrentEntryDisplayMode;
};

export type BwInstallState = "initial" | "installing" | "done" | "error";
