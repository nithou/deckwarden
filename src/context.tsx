import { createContext, useEffect, useState } from "react";
import {
  closePasswordManagerBe,
  mapBeEntriesToEntries,
  getEntriesBe,
  getEntryDetailsBe,
  openPasswordManagerBe,
  mapBeEntryDetailsToCurrentEntryDetails,
  mapBeSetupStateToSetupState,
  checkSetupStateBe,
  installBwBe,
  checkBwInstallStateBe,
  configureServerBe,
  loginApiKeyBe,
  logoutBe,
  syncBe,
  getEntryTotpBe,
  loginPasswordBe,
} from "./backend";
import React from "react";
import {
  BwInstallState,
  CurrentEntry,
  CurrentEntryDetails,
  CurrentEntryDisplayMode,
  Entry,
  PasswordLoginResult,
  PasteableDetail,
  SetupState,
  TotpCode,
  TwoFactorMethod,
} from "./interfaces";

import { useJsContextState } from "./hooks";
import { toaster } from "@decky/api";
import { pasteViaKeyboardInput } from "./copy-utils";

let securityToken = "";

// Decky rejects backend calls with { pythonTraceback } whose last line is
// "<ExceptionType>: <message>". Extract the bw detail the backend appended.
const getBackendErrorDetail = (e: unknown): string | null => {
  const traceback = (e as { pythonTraceback?: string } | null)?.pythonTraceback;
  const lastLine = traceback?.trim().split("\n").pop() ?? "";
  const match = lastLine.match(/\(bw .*\)\s*$/);
  return match ? match[0] : null;
};

interface PasswordManagerContextValue {
  currentEntries: Entry[] | null;
  currentEntry: CurrentEntry | null;
  currentEntryDetails: CurrentEntryDetails | null;
  setupState: SetupState | null;
  bwInstallState: BwInstallState;
  openPasswordManager: (password: string) => Promise<void>;
  closePasswordManager: () => Promise<void>;
  syncVault: () => Promise<void>;
  pasteEntryDetail: (detail: PasteableDetail) => Promise<void>;
  getEntryTotp: (entryId: string) => Promise<TotpCode>;
  toggleCurrentEntry: (
    newCurrentEntry: Entry | null,
    displayMode: CurrentEntryDisplayMode
  ) => Promise<void>;
  installBw: () => Promise<void>;
  configureServer: (url: string) => Promise<void>;
  login: (clientId: string, clientSecret: string) => Promise<boolean>;
  loginWithPassword: (
    email: string,
    password: string,
    method: TwoFactorMethod | null,
    code: string | null
  ) => Promise<PasswordLoginResult>;
  logout: () => Promise<void>;
}

const PasswordManagerContext = createContext<PasswordManagerContextValue>({
  currentEntries: null,
  currentEntry: null,
  currentEntryDetails: null,
  setupState: null,
  bwInstallState: "initial",
  openPasswordManager: async () => {},
  closePasswordManager: async () => {},
  syncVault: async () => {},
  pasteEntryDetail: async () => {},
  getEntryTotp: async () => ({ code: "", remainingSeconds: 0 }),
  toggleCurrentEntry: async () => {},
  installBw: async () => {},
  configureServer: async () => {},
  login: async () => false,
  loginWithPassword: async () => "error",
  logout: async () => {},
});

export interface PasswordMangerContextProviderProps {
  children: React.ReactNode;
}

export const PasswordMangerContextProvider = (
  props: PasswordMangerContextProviderProps
) => {
  const [currentEntryDetails, setCurrentEntryDetails] =
    useState<CurrentEntryDetails | null>(null);

  const [currentEntry, setCurrentEntry] = useJsContextState<CurrentEntry | null>(
    "currentEntry",
    null
  );
  const [currentEntries, setCurrentEntries] = useJsContextState<Entry[] | null>(
    "currentEntries",
    null
  );

  const [setupState, setSetupState] = useState<SetupState | null>(null);

  const [bwInstallState, setBwInstallState] = useState<BwInstallState>("initial");

  const handleErrors = async (
    errorMessage: string,
    callback: () => Promise<void>,
    resetEntries = true
  ) => {
    try {
      await callback();
    } catch (e) {
      console.error(e);
      toaster.toast({
        title: "DeckWarden Error",
        body: [errorMessage, getBackendErrorDetail(e)].filter(Boolean).join(" "),
      });
      if (resetEntries) {
        await setCurrentEntries(null);
        await setCurrentEntry(null);
        setCurrentEntryDetails(null);
      }
    }
  };

  const reloadEntries = async () => {
    const beEntries = await getEntriesBe(securityToken);
    const entries = mapBeEntriesToEntries(beEntries);
    await setCurrentEntries(entries);
    return entries;
  };

  const reloadSetupState = async () => {
    await handleErrors("Could not evaluate setup state", async () => {
      setSetupState(mapBeSetupStateToSetupState(await checkSetupStateBe()));
    });
  };

  const openPasswordManager = async (password: string) =>
    handleErrors("Failed to unlock vault", async () => {
      securityToken = await openPasswordManagerBe(password);
      await reloadEntries();
    });

  const closePasswordManager = async () => {
    await closePasswordManagerBe();
    await setCurrentEntries(null);
    await setCurrentEntry(null);
    securityToken = "";
  };

  const syncVault = async () =>
    handleErrors(
      "Failed to sync vault",
      async () => {
        await syncBe(securityToken);
        const entries = await reloadEntries();
        if (currentEntry && !entries.some((e) => e.id === currentEntry.id)) {
          await setCurrentEntry(null);
        }
        toaster.toast({ title: "DeckWarden", body: "Vault synced" });
      },
      false
    );

  const getEntryDetails = async (entryId: string): Promise<CurrentEntryDetails> => {
    const detailsBe = await getEntryDetailsBe(securityToken, entryId);

    return mapBeEntryDetailsToCurrentEntryDetails(detailsBe);
  };

  const getEntryTotp = async (entryId: string): Promise<TotpCode> => {
    const [code, remainingSeconds] = await getEntryTotpBe(securityToken, entryId);
    return { code, remainingSeconds };
  };

  const pasteEntryDetail = async (detail: PasteableDetail) => {
    if (!currentEntry) {
      return;
    }

    await handleErrors(
      "Failed to paste",
      async () => {
        const text =
          detail === "totp"
            ? (await getEntryTotp(currentEntry.id)).code
            : (await getEntryDetails(currentEntry.id))[detail];

        pasteViaKeyboardInput(text);
      },
      false
    );
  };

  const toggleCurrentEntry = async (
    newCurrentEntry: Entry | null,
    displayMode: CurrentEntryDisplayMode
  ) => {
    if (!newCurrentEntry) {
      await setCurrentEntry(null);
      return;
    }

    await setCurrentEntry({
      ...newCurrentEntry,
      displayMode,
    });
  };

  useEffect(() => {
    if (currentEntry?.displayMode !== "full") {
      setCurrentEntryDetails(null);
      return;
    }

    handleErrors("Failed to get details", async () => {
      setCurrentEntryDetails(await getEntryDetails(currentEntry.id));
    });
  }, [currentEntry, currentEntry?.displayMode]);

  useEffect(() => {
    reloadSetupState();
  }, [bwInstallState]);

  const installBw = async () => {
    await handleErrors("Failed to install Bitwarden CLI", async () => {
      setBwInstallState("installing");
      await installBwBe();
    });
  };

  useEffect(() => {
    if (bwInstallState !== "installing") {
      return;
    }

    const refreshMs = 2 * 1000;
    let interval = setInterval(async () => {
      const installState = await checkBwInstallStateBe();
      setBwInstallState(installState);
      if (["initial", "done", "error"].includes(installState)) {
        clearInterval(interval);
      }
    }, refreshMs);

    return () => {
      clearInterval(interval);
    };
  }, [bwInstallState, setBwInstallState]);

  useEffect(() => {
    handleErrors("Failed to check Bitwarden CLI install state", async () => {
      setBwInstallState(await checkBwInstallStateBe());
    });
  }, []);

  const configureServer = async (url: string) => {
    await handleErrors("Failed to configure server", async () => {
      await configureServerBe(url);
    });
    await reloadSetupState();
  };

  // Returns whether login succeeded, so the modal can stay open on errors
  const login = async (clientId: string, clientSecret: string) => {
    let success = false;
    await handleErrors(
      "Failed to log in. Check the API key and server URL.",
      async () => {
        await loginApiKeyBe(clientId, clientSecret);
        success = true;
      },
      false
    );
    await reloadSetupState();
    return success;
  };

  // Logs in and unlocks in one step; reports when a 2FA code is needed
  const loginWithPassword = async (
    email: string,
    password: string,
    method: TwoFactorMethod | null,
    code: string | null
  ): Promise<PasswordLoginResult> => {
    let result: PasswordLoginResult = "error";
    await handleErrors(
      "Failed to log in.",
      async () => {
        const [state, token] = await loginPasswordBe(email, password, method, code);
        if (state === "unlocked") {
          securityToken = token;
          await reloadEntries();
        }
        result = state as PasswordLoginResult;
      },
      false
    );
    await reloadSetupState();
    return result;
  };

  const logout = async () => {
    await handleErrors("Failed to log out", async () => {
      await logoutBe();
      securityToken = "";
    });
    await reloadSetupState();
  };

  const value: PasswordManagerContextValue = {
    currentEntries,
    currentEntry,
    currentEntryDetails,
    setupState,
    bwInstallState,
    openPasswordManager,
    closePasswordManager,
    syncVault,
    pasteEntryDetail,
    getEntryTotp,
    toggleCurrentEntry,
    installBw,
    configureServer,
    login,
    loginWithPassword,
    logout,
  };

  return (
    <PasswordManagerContext.Provider value={value}>
      {props.children}
    </PasswordManagerContext.Provider>
  );
};

export const usePasswordManagerContext = () => {
  return React.useContext(PasswordManagerContext);
};
