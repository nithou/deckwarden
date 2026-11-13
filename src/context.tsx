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
} from "./backend";
import React from "react";
import {
  BwInstallState,
  CurrentEntry,
  CurrentEntryDetails,
  CurrentEntryDisplayMode,
  Entry,
  SetupState,
} from "./interfaces";

import { useJsContextState } from "./hooks";
import { toaster } from "@decky/api";
import { pasteViaKeyboardInput } from "./copy-utils";

let securityToken = "";

interface PasswordManagerContextValue {
  currentEntries: Entry[] | null;
  currentEntry: CurrentEntry | null;
  currentEntryDetails: CurrentEntryDetails | null;
  setupState: SetupState | null;
  bwInstallState: BwInstallState;
  openPasswordManager: (password: string) => Promise<void>;
  closePasswordManager: () => Promise<void>;
  syncVault: () => Promise<void>;
  pasteEntryDetail: (detail: keyof CurrentEntryDetails) => Promise<void>;
  toggleCurrentEntry: (
    newCurrentEntry: Entry | null,
    displayMode: CurrentEntryDisplayMode
  ) => Promise<void>;
  installBw: () => Promise<void>;
  configureServer: (url: string) => Promise<void>;
  login: (clientId: string, clientSecret: string) => Promise<void>;
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
  toggleCurrentEntry: async () => {},
  installBw: async () => {},
  configureServer: async () => {},
  login: async () => {},
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
        body: errorMessage,
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

  const pasteEntryDetail = async (detail: keyof CurrentEntryDetails) => {
    if (!currentEntry) {
      return;
    }

    const details = await getEntryDetails(currentEntry.id);

    pasteViaKeyboardInput(details[detail]);
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

  const login = async (clientId: string, clientSecret: string) => {
    await handleErrors(
      "Failed to log in. Check the API key and server URL.",
      async () => {
        await loginApiKeyBe(clientId, clientSecret);
      }
    );
    await reloadSetupState();
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
    toggleCurrentEntry,
    installBw,
    configureServer,
    login,
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
