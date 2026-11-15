import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  showModal,
  findSP,
  TextField,
  DropdownItem,
} from "@decky/ui";
import { FaKey, FaLock, FaLockOpen, FaSignOutAlt, FaSync } from "react-icons/fa";
import { useEffect, useState } from "react";
import { usePasswordManagerContext } from "../context";
import { EntryComponent } from "./entry";
import { ButtonItemIconContent } from "./shared";
import { isLoggedIn, SetupGuide } from "./setup-guide";
import { OpenDatabaseModal } from "./modals/open-database-modal";
import { useJsContextState } from "../hooks";
import { UpdateBanner, VersionInfo } from "./update-banner";
import { Entry } from "../interfaces";

const centeredTextStyle: React.CSSProperties = {
  textAlign: "center",
  marginTop: "20px",
  marginBottom: "20px",
  whiteSpace: "normal",
  wordBreak: "break-word",
};

const autoLockOptions = [
  { data: 0, label: "Never" },
  { data: 5, label: "5 minutes" },
  { data: 10, label: "10 minutes" },
  { data: 15, label: "15 minutes" },
  { data: 30, label: "30 minutes" },
  { data: 60, label: "1 hour" },
];

const AutoLockSetting = () => {
  const { autoLockMinutes, setAutoLockMinutes } = usePasswordManagerContext();

  if (autoLockMinutes === null) {
    return null;
  }

  return (
    <DropdownItem
      label="Auto-lock"
      description="Lock the vault after this long without using it"
      rgOptions={autoLockOptions}
      selectedOption={autoLockMinutes}
      onChange={(option) => setAutoLockMinutes(option.data)}
    />
  );
};

export const PasswordManagerClosed = () => {
  const { openPasswordManager, setupState, logout } = usePasswordManagerContext();

  const loggedIn = isLoggedIn(setupState);

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

        <ButtonItem
          layout="below"
          disabled={!loggedIn}
          onClick={() => showModal(openDatabaseModal, findSP())}
        >
          <ButtonItemIconContent icon={<FaLockOpen />}>
            Unlock Vault
          </ButtonItemIconContent>
        </ButtonItem>

        {loggedIn && (
          <ButtonItem layout="below" onClick={() => logout()}>
            <ButtonItemIconContent icon={<FaSignOutAlt />}>Log out</ButtonItemIconContent>
          </ButtonItem>
        )}

        <SetupGuide initiallyOpen={setupState !== null && !loggedIn} />
        <AutoLockSetting />
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
