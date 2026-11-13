import { PanelSection, PanelSectionRow, ButtonItem, showModal, findSP } from "@decky/ui";
import { FaKey, FaLock, FaLockOpen, FaSignOutAlt, FaSync } from "react-icons/fa";
import { useState } from "react";
import { usePasswordManagerContext } from "../context";
import { EntryComponent } from "./entry";
import { ButtonItemIconContent } from "./shared";
import { isLoggedIn, SetupGuide } from "./setup-guide";
import { OpenDatabaseModal } from "./modals/open-database-modal";

const centeredTextStyle: React.CSSProperties = {
  textAlign: "center",
  marginTop: "20px",
  marginBottom: "20px",
  whiteSpace: "normal",
  wordBreak: "break-word",
};

export const PasswordManagerClosed = () => {
  const { openPasswordManager, setupState, logout } = usePasswordManagerContext();

  const loggedIn = isLoggedIn(setupState);

  const openDatabaseModal = (
    <OpenDatabaseModal onOpen={(password) => openPasswordManager(password)} />
  );

  return (
    <PanelSection>
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
      </PanelSectionRow>
    </PanelSection>
  );
};

export const PasswordManagerOpened = () => {
  const { currentEntries, closePasswordManager, syncVault } = usePasswordManagerContext();
  const [isSyncing, setIsSyncing] = useState(false);

  if (!currentEntries) {
    return <div />;
  }

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
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => closePasswordManager()}>
          <ButtonItemIconContent icon={<FaLock />}>Lock Vault</ButtonItemIconContent>
        </ButtonItem>
        <ButtonItem layout="below" disabled={isSyncing} onClick={onSync}>
          <ButtonItemIconContent icon={<FaSync />}>
            {isSyncing ? "Syncing..." : "Sync"}
          </ButtonItemIconContent>
        </ButtonItem>
        <div style={{ marginTop: "20px" }}></div>
        {currentEntries.length === 0 && (
          <div style={centeredTextStyle}>No login items in this vault.</div>
        )}
      </PanelSectionRow>
      {currentEntries.map((entry) => (
        <EntryComponent key={entry.id} entry={entry} />
      ))}
    </PanelSection>
  );
};

export const PasswordManager = () => {
  const { currentEntries } = usePasswordManagerContext();

  return currentEntries ? <PasswordManagerOpened /> : <PasswordManagerClosed />;
};
