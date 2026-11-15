import { ButtonItem, PanelSectionRow } from "@decky/ui";
import { useState } from "react";
import { FaArrowCircleUp, FaSync } from "react-icons/fa";
import { usePasswordManagerContext } from "../context";
import { ButtonItemIconContent } from "./shared";

export const UpdateBanner = () => {
  const { updateState, installUpdate } = usePasswordManagerContext();

  const update = updateState?.update;
  if (!update) {
    return null;
  }

  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        onClick={() => installUpdate()}
        description={`Installed: v${updateState?.currentVersion}`}
      >
        <ButtonItemIconContent icon={<FaArrowCircleUp />}>
          Update to v{update.version}
        </ButtonItemIconContent>
      </ButtonItem>
    </PanelSectionRow>
  );
};

export const VersionInfo = () => {
  const { updateState, checkForUpdates, installUpdate } = usePasswordManagerContext();
  const [isChecking, setIsChecking] = useState(false);

  // Offer the update right here too: the banner is at the top of the panel
  const update = updateState?.update;
  if (update) {
    return (
      <ButtonItem
        layout="below"
        onClick={() => installUpdate()}
        description={`DeckWarden v${updateState?.currentVersion}`}
      >
        <ButtonItemIconContent icon={<FaArrowCircleUp />}>
          Update to v{update.version}
        </ButtonItemIconContent>
      </ButtonItem>
    );
  }

  const onCheck = async () => {
    setIsChecking(true);
    try {
      await checkForUpdates(true);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <ButtonItem
      layout="below"
      disabled={isChecking}
      onClick={onCheck}
      description={updateState ? `DeckWarden v${updateState.currentVersion}` : undefined}
    >
      <ButtonItemIconContent icon={<FaSync />}>
        {isChecking ? "Checking..." : "Check for updates"}
      </ButtonItemIconContent>
    </ButtonItem>
  );
};
