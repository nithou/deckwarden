import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  showModal,
  findSP,
  TextField,
} from "@decky/ui";
import {
  FaKey,
  FaLock,
  FaLockOpen,
  FaSignOutAlt,
  FaSync,
  FaUnlockAlt,
} from "react-icons/fa";
import { useEffect, useState } from "react";
import { usePasswordManagerContext } from "../context";
import { EntryComponent } from "./entry";
import { ButtonItemIconContent } from "./shared";
import { isLoggedIn, SetupGuide } from "./setup-guide";
import { OpenDatabaseModal } from "./modals/open-database-modal";
import { useJsContextState } from "../hooks";
import { UpdateBanner, VersionInfo } from "./update-banner";
import { Entry } from "../interfaces";
import { SettingsSection } from "./settings-section";
import { PinUnlockModal } from "./modals/pin-modals";

const centeredTextStyle: React.CSSProperties = {
  textAlign: "center",
  marginTop: "20px",
  marginBottom: "20px",
  whiteSpace: "normal",
  wordBreak: "break-word",
};

export const PasswordManagerClosed = () => {
  const {
    openPasswordManager,
    setupState,
    logout,
    pinState,
    unlockWithPin,
    lockCompletely,
    reloadPinState,
  } = usePasswordManagerContext();

  const loggedIn = isLoggedIn(setupState);
  const pinLocked = loggedIn && !!pinState?.pinLocked;

  // The PIN may have expired (time limit) while the panel was closed
  useEffect(() => {
    reloadPinState();
  }, []);

  const openDatabaseModal = (
    <OpenDatabaseModal onOpen={(password) => openPasswordManager(password)} />
  );

  return (
    <PanelSection>
      <UpdateBanner />
      <PanelSectionRow>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "20px",
            marginBottom: "20px",
          }}
        >
          <FaKey size={60}></FaKey>
        </div>

        {!loggedIn && (
          <div style={centeredTextStyle}>
            <strong>DeckWarden is not fully setup yet.</strong> Please follow the Setup
            Guide to complete the required steps.
          </div>
        )}

        {loggedIn && (
          <div style={centeredTextStyle}>
            <div>
              <strong>{setupState?.userEmail}</strong>
            </div>
            <div>{setupState?.serverUrl}</div>
          </div>
        )}

        {pinLocked && (
          <ButtonItem
            layout="below"
            onClick={() =>
              showModal(
                <PinUnlockModal
                  attemptsLeft={pinState?.attemptsLeft ?? 5}
                  onUnlock={unlockWithPin}
                />,
                findSP()
              )
            }
          >
            <ButtonItemIconContent icon={<FaUnlockAlt />}>
              Unlock with PIN
            </ButtonItemIconContent>
          </ButtonItem>
        )}

        <ButtonItem
          layout="below"
          disabled={!loggedIn}
          onClick={() => showModal(openDatabaseModal, findSP())}
        >
          <ButtonItemIconContent icon={<FaLockOpen />}>
            {pinLocked ? "Unlock with master password" : "Unlock Vault"}
          </ButtonItemIconContent>
        </ButtonItem>

        {pinLocked && (
          <ButtonItem layout="below" onClick={() => lockCompletely()}>
            <ButtonItemIconContent icon={<FaLock />}>
              Lock completely
            </ButtonItemIconContent>
          </ButtonItem>
        )}

        {loggedIn && (
          <ButtonItem layout="below" onClick={() => logout()}>
            <ButtonItemIconContent icon={<FaSignOutAlt />}>Log out</ButtonItemIconContent>
          </ButtonItem>
        )}

        <SetupGuide initiallyOpen={setupState !== null && !loggedIn} />
        {loggedIn && <SettingsSection vaultOpen={false} />}
        <VersionInfo />
      </PanelSectionRow>
    </PanelSection>
  );
};

// Every whitespace-separated term must appear in "Folder/Name" or one of the
// entry's URIs (case-insensitive).
const matchesSearch = (entry: Entry, query: string) => {
  const haystack = [entry.path, ...entry.uris].join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
};

export const PasswordManagerOpened = () => {
  const { currentEntries, closePasswordManager, syncVault, touchVault } =
    usePasswordManagerContext();
  const [isSyncing, setIsSyncing] = useState(false);
  // Kept across Quick Access Menu re-mounts (e.g. after pasting closes the menu)
  const [searchQuery, setSearchQuery] = useJsContextState<string>("searchQuery", "");

  // Opening the panel counts as activity and checks the session is alive
  useEffect(() => {
    touchVault();
  }, []);

  if (!currentEntries) {
    return <div />;
  }

  const filteredEntries = currentEntries.filter((entry) =>
    matchesSearch(entry, searchQuery)
  );

  const onSync = async () => {
    setIsSyncing(true);
    try {
      await syncVault();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <PanelSection>
      <UpdateBanner />
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={async () => {
            await setSearchQuery("");
            await closePasswordManager();
          }}
        >
          <ButtonItemIconContent icon={<FaLock />}>Lock Vault</ButtonItemIconContent>
        </ButtonItem>
        <ButtonItem layout="below" disabled={isSyncing} onClick={onSync}>
          <ButtonItemIconContent icon={<FaSync />}>
            {isSyncing ? "Syncing..." : "Sync"}
          </ButtonItemIconContent>
        </ButtonItem>
        <SettingsSection vaultOpen={true} />
        <div style={{ marginTop: "20px" }}></div>
        {currentEntries.length > 0 && (
          <TextField
            label="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        )}
        {currentEntries.length === 0 && (
          <div style={centeredTextStyle}>No login items in this vault.</div>
        )}
        {currentEntries.length > 0 && filteredEntries.length === 0 && (
          <div style={centeredTextStyle}>No items match "{searchQuery}".</div>
        )}
      </PanelSectionRow>
      {filteredEntries.map((entry) => (
        <EntryComponent key={entry.id} entry={entry} />
      ))}
    </PanelSection>
  );
};

export const PasswordManager = () => {
  const { currentEntries } = usePasswordManagerContext();

  return currentEntries ? <PasswordManagerOpened /> : <PasswordManagerClosed />;
};
