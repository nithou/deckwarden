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
  touchBe,
  getPinStateBe,
  setPinSettingsBe,
  setPinBe,
  unlockWithPinBe,
  lockVaultBe,
  getAutoLockMinutesBe,
  setAutoLockMinutesBe,
  loginPasswordBe,
  checkForUpdateBe,
  installUpdate as installUpdateBe,
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
  UpdateState,
  PinState,
  PinUnlockResult,
} from "./interfaces";

import { clearJsContextState, useJsContextState } from "./hooks";
import { addEventListener, removeEventListener, toaster } from "@decky/api";
import { pasteViaKeyboardInput } from "./copy-utils";
import { findSP, showModal } from "@decky/ui";
import { SetPinModal } from "./components/modals/pin-modals";

let securityToken = "";

const AUTO_LOCK_EVENT = "vault_auto_locked";

// Module-level: runs even while the panel is closed (unmounted), so a later
// re-mount doesn't show entries of a vault that is already locked.
addEventListener(AUTO_LOCK_EVENT, (pinLocked: boolean) => {
  securityToken = "";
  clearJsContextState("currentEntries", "currentEntry", "searchQuery");
  toaster.toast({
    title: "DeckWarden",
    body: pinLocked
      ? "Vault locked after inactivity. Unlock it with your PIN."
      : "Vault locked after inactivity",
  });
});

// Decky rejects backend calls with { pythonTraceback } whose last line is
// "<ExceptionType>: <message>". Extract the bw detail the backend appended.
const getBackendErrorDetail = (e: unknown): string | null => {
  const traceback = (e as { pythonTraceback?: string } | null)?.pythonTraceback;
  const lastLine = traceback?.trim().split("\n").pop() ?? "";
  const match = lastLine.match(/\((?:bw |PIN: ).*\)\s*$/);
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
  lockCompletely: () => Promise<void>;
  pinState: PinState | null;
  reloadPinState: () => Promise<PinState | null>;
  setPinSettings: (enabled: boolean, maxHours: number) => Promise<void>;
  setPin: (pin: string) => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<PinUnlockResult>;
  syncVault: () => Promise<void>;
  pasteEntryDetail: (detail: PasteableDetail) => Promise<void>;
  getEntryTotp: (entryId: string, userAction?: boolean) => Promise<TotpCode>;
  touchVault: () => Promise<void>;
  autoLockMinutes: number | null;
  setAutoLockMinutes: (minutes: number) => Promise<void>;
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
  updateState: UpdateState | null;
  checkForUpdates: (force: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
}

const PasswordManagerContext = createContext<PasswordManagerContextValue>({
  currentEntries: null,
  currentEntry: null,
  currentEntryDetails: null,
  setupState: null,
  bwInstallState: "initial",
  openPasswordManager: async () => {},
  closePasswordManager: async () => {},
  lockCompletely: async () => {},
  pinState: null,
  reloadPinState: async () => null,
  setPinSettings: async () => {},
  setPin: async () => false,
  unlockWithPin: async () => "unavailable",
  syncVault: async () => {},
  pasteEntryDetail: async () => {},
  getEntryTotp: async () => ({ code: "", remainingSeconds: 0 }),
  touchVault: async () => {},
  autoLockMinutes: null,
  setAutoLockMinutes: async () => {},
  toggleCurrentEntry: async () => {},
  installBw: async () => {},
  configureServer: async () => {},
  login: async () => false,
  loginWithPassword: async () => "error",
  logout: async () => {},
  updateState: null,
  checkForUpdates: async () => {},
  installUpdate: async () => {},
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

  const [updateState, setUpdateState] = useState<UpdateState | null>(null);

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

  const [pinState, setPinState] = useState<PinState | null>(null);

  const reloadPinState = async (): Promise<PinState | null> => {
    try {
      const [enabled, hasPin, pinLocked, attemptsLeft, maxHours] = await getPinStateBe();
      const state = { enabled, hasPin, pinLocked, attemptsLeft, maxHours };
      setPinState(state);
      return state;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  useEffect(() => {
    reloadPinState();
  }, []);

  const setPin = async (pin: string) => {
    let success = false;
    await handleErrors(
      "Failed to set PIN.",
      async () => {
        await setPinBe(securityToken, pin);
        success = true;
        toaster.toast({ title: "DeckWarden", body: "PIN set" });
      },
      false
    );
    await reloadPinState();
    return success;
  };

  const promptSetPin = () => showModal(<SetPinModal onSetPin={setPin} />, findSP());

  // After a master password unlock, offer to set a PIN if the option is on
  const afterPasswordUnlock = async () => {
    const state = await reloadPinState();
    if (state?.enabled && !state.hasPin) {
      promptSetPin();
    }
  };

  const openPasswordManager = async (password: string) =>
    handleErrors("Failed to unlock vault", async () => {
      securityToken = await openPasswordManagerBe(password);
      await reloadEntries();
      await afterPasswordUnlock();
    });

  const resetOpenState = async () => {
    securityToken = "";
    await setCurrentEntries(null);
    await setCurrentEntry(null);
    setCurrentEntryDetails(null);
  };

  // "Lock Vault": PIN lock when a PIN is set, else full lock
  const closePasswordManager = async () => {
    await lockVaultBe();
    await resetOpenState();
    await reloadPinState();
  };

  // Forget the session and PIN; the master password will be needed
  const lockCompletely = async () => {
    await closePasswordManagerBe();
    await resetOpenState();
    await reloadPinState();
  };

  const unlockWithPin = async (pin: string): Promise<PinUnlockResult> => {
    let result = "wrong" as PinUnlockResult;
    await handleErrors(
      "PIN unlock failed.",
      async () => {
        securityToken = await unlockWithPinBe(pin);
        await reloadEntries();
        result = "unlocked";
      },
      false
    );
    const state = await reloadPinState();
    // Too many attempts or expired: the backend locked completely
    if (result !== "unlocked" && !state?.pinLocked) {
      result = "unavailable";
    }
    return result;
  };

  const setPinSettings = async (enabled: boolean, maxHours: number) => {
    await handleErrors(
      "Failed to save PIN settings",
      async () => {
        await setPinSettingsBe(enabled, maxHours);
      },
      false
    );
    const state = await reloadPinState();
    // Turned on while the vault is open: set the PIN right away
    if (state?.enabled && !state.hasPin && securityToken) {
      promptSetPin();
    }
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

  const getEntryTotp = async (entryId: string, userAction = true): Promise<TotpCode> => {
    const [code, remainingSeconds] = await getEntryTotpBe(
      securityToken,
      entryId,
      userAction
    );
    return { code, remainingSeconds };
  };

  // Opening the panel counts as activity for auto-lock
  const touchVault = async () => {
    if (!securityToken) {
      return;
    }
    try {
      await touchBe(securityToken);
    } catch (e) {
      // Session gone (e.g. backend restarted): fall back to the locked view
      console.error(e);
      securityToken = "";
      await setCurrentEntries(null);
      await setCurrentEntry(null);
    }
  };

  const [autoLockMinutes, setAutoLockMinutesState] = useState<number | null>(null);

  useEffect(() => {
    getAutoLockMinutesBe()
      .then(setAutoLockMinutesState)
      .catch((e) => console.error(e));
  }, []);

  const setAutoLockMinutes = async (minutes: number) => {
    await handleErrors(
      "Failed to save auto-lock setting",
      async () => {
        await setAutoLockMinutesBe(minutes);
        setAutoLockMinutesState(minutes);
      },
      false
    );
  };

  // The backend locks the vault itself after inactivity and tells us
  useEffect(() => {
    // Module-level listener above clears the token and toasts; this one
    // updates the mounted panel.
    const listener = addEventListener(AUTO_LOCK_EVENT, async () => {
      await setCurrentEntries(null);
      await setCurrentEntry(null);
      setCurrentEntryDetails(null);
      await reloadPinState();
    });
    return () => removeEventListener(AUTO_LOCK_EVENT, listener);
  }, []);

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
          await afterPasswordUnlock();
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

  const checkForUpdates = async (force: boolean) => {
    try {
      const [currentVersion, update] = await checkForUpdateBe(force);
      setUpdateState({ currentVersion, update });
      if (force) {
        toaster.toast({
          title: "DeckWarden",
          body: update
            ? `Update available: v${update.version}`
            : `Up to date (v${currentVersion})`,
        });
      }
    } catch (e) {
      // Offline or GitHub unreachable: stay silent unless asked explicitly
      console.error(e);
      if (force) {
        toaster.toast({ title: "DeckWarden Error", body: "Could not check for updates" });
      }
    }
  };

  // Backend caches the result for a few hours, so this is cheap
  useEffect(() => {
    checkForUpdates(false);
  }, []);

  const installUpdate = async () => {
    const update = updateState?.update;
    if (!update) {
      return;
    }
    try {
      await installUpdateBe(update);
    } catch (e) {
      console.error(e);
      toaster.toast({
        title: "DeckWarden Error",
        body: "Update failed. Install it via Settings → Developer → Install plugin from URL.",
      });
    }
  };

  const value: PasswordManagerContextValue = {
    currentEntries,
    currentEntry,
    currentEntryDetails,
    setupState,
    bwInstallState,
    openPasswordManager,
    closePasswordManager,
    lockCompletely,
    pinState,
    reloadPinState,
    setPinSettings,
    setPin,
    unlockWithPin,
    syncVault,
    pasteEntryDetail,
    getEntryTotp,
    touchVault,
    autoLockMinutes,
    setAutoLockMinutes,
    toggleCurrentEntry,
    installBw,
    configureServer,
    login,
    loginWithPassword,
    logout,
    updateState,
    checkForUpdates,
    installUpdate,
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
